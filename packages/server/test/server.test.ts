import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import {
	type ClientCapabilities,
	CompletionRequest,
	CompletionResolveRequest,
	ConfigurationRequest,
	DefinitionRequest,
	DidChangeTextDocumentNotification,
	DidOpenTextDocumentNotification,
	DocumentColorRequest,
	ExitNotification,
	HoverRequest,
	InitializeRequest,
	InitializedNotification,
	InlayHintRequest,
	type LocationLink,
	type MarkupContent,
	type ProtocolConnection,
	SemanticTokensRequest,
	ShowMessageNotification,
	type ShowMessageParams,
	ShutdownRequest,
	SignatureHelpRequest,
	StreamMessageReader,
	StreamMessageWriter,
	createProtocolConnection,
} from "vscode-languageserver-protocol/node";

const fixturesDir = join(import.meta.dirname, "fixtures");
const serverPath = join(import.meta.dirname, "..", "dist", "server.js");

type Session = {
	connection: ProtocolConnection;
	process: ChildProcess;
	firstMessage: Promise<ShowMessageParams>;
};

const startSession = async (options: {
	capabilities: ClientCapabilities;
	initializationOptions?: unknown;
	configuration?: unknown;
	workspaceFolders?: string[];
}): Promise<Session> => {
	const child = spawn(
		process.execPath,
		[serverPath, "--stdio", "--data", join(fixturesDir, "data")],
		{ stdio: ["pipe", "pipe", "inherit"] },
	);
	const connection = createProtocolConnection(
		new StreamMessageReader(child.stdout!),
		new StreamMessageWriter(child.stdin!),
	);
	const firstMessage = Promise.withResolvers<ShowMessageParams>();
	connection.onNotification(ShowMessageNotification.type, firstMessage.resolve);
	connection.onRequest(ConfigurationRequest.type, ({ items }) =>
		items.map(() => options.configuration ?? null),
	);
	connection.listen();

	await connection.sendRequest(InitializeRequest.type, {
		processId: process.pid,
		rootUri: null,
		workspaceFolders:
			options.workspaceFolders?.map((path) => ({ uri: pathToFileURL(path).href, name: "root" })) ??
			null,
		capabilities: options.capabilities,
		initializationOptions: options.initializationOptions,
	});
	await connection.sendNotification(InitializedNotification.type, {});
	return { connection, process: child, firstMessage: firstMessage.promise };
};

const stopSession = async ({ connection, process }: Session) => {
	await connection.sendRequest(ShutdownRequest.type);
	await connection.sendNotification(ExitNotification.type);
	connection.dispose();
	process.kill();
};

/**
 * Retries `get` until it returns a value. Only for effects of real file system events, which the
 * server reports to no one: there is no signal to await instead.
 */
const eventually = async <T>(get: () => Promise<T | null | undefined>, timeoutMs = 5000) => {
	const end = Date.now() + timeoutMs;
	while (true) {
		const value = await get();
		if (value !== null && value !== undefined) return value;
		if (Date.now() > end) throw new Error("Timed out waiting for the server.");
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 100);
		await promise;
	}
};

describe("language server over stdio", () => {
	let root: string;
	let session: Session;
	let dmUri: string;
	let utilityUri: string;
	const textDocument = () => ({ uri: dmUri });

	before(async () => {
		root = await mkdtemp(join(tmpdir(), "gsc-ls-test-"));
		await cp(join(fixturesDir, "root"), root, { recursive: true });
		// JetBrains-style URIs (e.g. `file:///C:/...`), which differ from the server's normalized form:
		dmUri = pathToFileURL(join(root, "maps", "mp", "gametypes", "dm.gsc")).href;
		utilityUri = pathToFileURL(join(root, "maps", "mp", "_utility.gsc")).href;

		session = await startSession({
			capabilities: {
				workspace: { configuration: true },
				textDocument: {
					definition: { linkSupport: true },
					completion: { completionItem: { snippetSupport: true } },
				},
			},
			configuration: { rootDirectories: { iw3: [root] } },
		});
		await session.connection.sendNotification(DidOpenTextDocumentNotification.type, {
			textDocument: {
				uri: dmUri,
				languageId: "gsc",
				version: 1,
				text: await readFile(join(root, "maps", "mp", "gametypes", "dm.gsc"), "utf-8"),
			},
		});
	});

	after(async () => {
		await stopSession(session);
		await rm(root, { recursive: true, force: true });
	});

	const requestDefinition = (line: number, character: number) =>
		session.connection.sendRequest(DefinitionRequest.type, {
			textDocument: textDocument(),
			position: { line, character },
		}) as Promise<LocationLink[] | null>;

	const sameFile = (a: string, b: string) =>
		decodeURIComponent(a).toLowerCase() === decodeURIComponent(b).toLowerCase();

	it("resolves definitions of included script functions", async () => {
		const [link] = (await requestDefinition(4, 3))!;
		assert.ok(sameFile(link.targetUri, utilityUri), link.targetUri);
		assert.deepEqual(link.targetSelectionRange, {
			start: { line: 0, character: 0 },
			end: { line: 0, character: 8 },
		});
		assert.deepEqual(link.originSelectionRange, {
			start: { line: 4, character: 1 },
			end: { line: 4, character: 9 },
		});
	});

	it("resolves include paths to their script file", async () => {
		const [link] = (await requestDefinition(0, 15))!;
		assert.ok(sameFile(link.targetUri, utilityUri), link.targetUri);
	});

	it("documents engine functions on hover regardless of case", async () => {
		const hover = await session.connection.sendRequest(HoverRequest.type, {
			textDocument: textDocument(),
			position: { line: 5, character: 3 },
		});
		const contents = hover?.contents as MarkupContent;
		assert.match(contents.value, /iPrintLn\(<text>\)/);
		assert.match(contents.value, /Write line to the screen\./);
	});

	it("completes keywords, snippets, engine and script functions with lazy documentation", async () => {
		const list = await session.connection.sendRequest(CompletionRequest.type, {
			textDocument: textDocument(),
			position: { line: 7, character: 0 },
		});
		const items = Array.isArray(list) ? list : (list?.items ?? []);
		const byLabel = new Map(items.map((item) => [`${item.label}:${item.kind}`, item]));

		assert.ok(byLabel.has("if:14"), "keyword"); // CompletionItemKind.Keyword
		assert.equal(byLabel.get("ifelse:15")?.insertTextFormat, 2); // Snippet kind and format
		assert.equal(byLabel.get("wait_for:3")?.labelDetails?.description, "maps\\mp\\_utility");
		assert.ok(!byLabel.has("oldThing:3"), "deprecated engine functions are hidden by default");

		const iPrintLn = byLabel.get("iPrintLn:3")!;
		assert.equal(iPrintLn.documentation, undefined);
		const resolved = await session.connection.sendRequest(CompletionResolveRequest.type, iPrintLn);
		assert.match((resolved.documentation as MarkupContent).value, /Write line to the screen\./);
	});

	it("shows the active parameter in signature help", async () => {
		const help = await session.connection.sendRequest(SignatureHelpRequest.type, {
			textDocument: textDocument(),
			position: { line: 4, character: 18 },
		});
		assert.equal(help?.signatures[0].label, "wait_for(<ent>, <msg>)");
		assert.equal(help?.activeParameter, 1);
	});

	it("provides parameter name inlay hints", async () => {
		const hints = await session.connection.sendRequest(InlayHintRequest.type, {
			textDocument: textDocument(),
			range: { start: { line: 0, character: 0 }, end: { line: 9, character: 0 } },
		});
		assert.deepEqual(
			hints?.map(({ label, position }) => [label, position.line, position.character]),
			[
				["ent:", 4, 10],
				["msg:", 4, 17],
				["text:", 5, 10],
			],
		);
	});

	it("provides semantic tokens for the whole document", async () => {
		const tokens = await session.connection.sendRequest(SemanticTokensRequest.type, {
			textDocument: textDocument(),
		});
		const decoded: number[][] = [];
		let line = 0;
		let character = 0;
		for (let i = 0; i < (tokens?.data.length ?? 0); i += 5) {
			const [deltaLine, deltaStart, length, type, modifiers] = tokens!.data.slice(i, i + 5);
			line += deltaLine;
			character = deltaLine === 0 ? character + deltaStart : deltaStart;
			decoded.push([line, character, length, type, modifiers]);
		}
		assert.deepEqual(decoded, [
			[2, 0, 4, 0, 0b001], // main: function definition
			[5, 1, 8, 0, 0b010], // iPrintLn: engine function
		]);
	});

	it("detects colors", async () => {
		const colors = await session.connection.sendRequest(DocumentColorRequest.type, {
			textDocument: textDocument(),
		});
		assert.equal(colors.length, 1);
		assert.deepEqual(colors[0].color, { red: 0, green: 128 / 255, blue: 1, alpha: 1 });
	});

	it("re-parses edited documents and picks up new script files", async () => {
		await writeFile(join(root, "maps", "mp", "_new.gsc"), "new_func()\n{\n}\n");
		await session.connection.sendNotification(DidChangeTextDocumentNotification.type, {
			textDocument: { uri: dmUri, version: 2 },
			contentChanges: [
				{
					range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
					text: "#include maps\\mp\\_new;\n",
				},
				{
					range: { start: { line: 8, character: 0 }, end: { line: 8, character: 0 } },
					text: "\tnew_func();\n",
				},
			],
		});

		const [link] = await eventually(() => requestDefinition(8, 3));
		assert.ok(link.targetUri.endsWith("_new.gsc"), link.targetUri);
		assert.equal(link.targetSelectionRange.start.line, 0);
	});
});

describe("language server settings", () => {
	it(
		"reads initialization options and warns about invalid root directories",
		{ timeout: 5000 },
		async () => {
			const missing = join(tmpdir(), "gsc-ls-test-missing");
			const session = await startSession({
				capabilities: {},
				initializationOptions: { GSC: { rootDirectories: { iw3: [missing] } } },
			});
			try {
				const message = await session.firstMessage;
				assert.equal(message.type, 2); // Warning
				assert.ok(message.message.includes(missing), message.message);
			} finally {
				await stopSession(session);
			}
		},
	);

	it("uses workspace folders as the default engine's root directories", async () => {
		const root = join(fixturesDir, "root");
		const session = await startSession({ capabilities: {}, workspaceFolders: [root] });
		try {
			const path = join(root, "maps", "mp", "gametypes", "dm.gsc");
			const uri = pathToFileURL(path).href;
			await session.connection.sendNotification(DidOpenTextDocumentNotification.type, {
				textDocument: { uri, languageId: "gsc", version: 1, text: await readFile(path, "utf-8") },
			});
			const locations = (await session.connection.sendRequest(DefinitionRequest.type, {
				textDocument: { uri },
				position: { line: 4, character: 3 },
			})) as { uri: string }[] | null;
			assert.ok(locations?.[0]?.uri.endsWith("_utility.gsc"), JSON.stringify(locations));
		} finally {
			await stopSession(session);
		}
	});
});

describe("menu language server over stdio", () => {
	let root: string;
	let session: Session;
	let uri: string;
	const text = [
		'#include "common.inc"',
		"{",
		' functionDef { name "enabled" value dvarInt("ui_enabled") }',
		" menuDef {",
		'  name "main"',
		"  rect 0 0 WIDTH 480",
		'  onOpen { setdvar "ui_test" "1"; open main; }',
		"  itemDef {",
		'   name "button"',
		"   forecolor 1 0.5 0 0.25",
		"   visible (enabled() && CHECK(1))",
		"   action { setfocus button; }",
		"   // setdvar and { stay comments",
		"  }",
		" }",
		"}",
	].join("\n");
	const at = (word: string, delta = 1) => {
		const prefix = text.slice(0, text.indexOf(word) + delta);
		const lines = prefix.split("\n");
		return { line: lines.length - 1, character: lines.at(-1)!.length };
	};
	const params = (word: string, delta = 1) => ({
		textDocument: { uri },
		position: at(word, delta),
	});

	before(async () => {
		root = await mkdtemp(join(tmpdir(), "menu-lsp-test-"));
		await writeFile(
			join(root, "common.inc"),
			'#define WIDTH 640\n#include "common.inc"\n#define CHECK(x) (x)\n',
		);
		uri = pathToFileURL(join(root, "main.menu")).href;
		session = await startSession({ capabilities: {}, workspaceFolders: [root] });
		await session.connection.sendNotification(DidOpenTextDocumentNotification.type, {
			textDocument: { uri, languageId: "menu", version: 1, text },
		});
	});
	after(async () => {
		await stopSession(session);
		await rm(root, { recursive: true, force: true });
	});

	it("completes UI properties and commands without GSC functions", async () => {
		const props = await session.connection.sendRequest(CompletionRequest.type, params("forecolor"));
		assert.ok(Array.isArray(props));
		assert.ok(props.some((item) => item.label === "forecolor"));
		assert.ok(!props.some((item) => item.label === "onOpen" || item.label === "thread"));
		const commands = await session.connection.sendRequest(
			CompletionRequest.type,
			params("setdvar"),
		);
		assert.ok(Array.isArray(commands));
		assert.ok(commands.some((item) => item.label === "setdvar"));
		assert.ok(!commands.some((item) => item.label === "forecolor"));
	});

	it("does not complete within comments or strings", async () => {
		for (const word of ["setdvar and", '"ui_test"']) {
			assert.deepEqual(
				await session.connection.sendRequest(CompletionRequest.type, params(word, 3)),
				[],
			);
		}
	});

	it("shows UI syntax on hover", async () => {
		const hover = await session.connection.sendRequest(HoverRequest.type, params("forecolor"));
		assert.match((hover?.contents as MarkupContent).value, /forecolor r \[g \[b \[a\]\]\]/);
	});

	it("navigates includes, included macros, menu names, item names and custom functions", async () => {
		for (const [word, line, target] of [
			["common.inc", 0, "common.inc"],
			["WIDTH", 0, "common.inc"],
			["open main", 4, "main.menu"],
			["setfocus button", 8, "main.menu"],
			["enabled()", 2, "main.menu"],
			["CHECK(1)", 2, "common.inc"],
		] as const) {
			const delta = word.startsWith("open ") ? 6 : word.startsWith("setfocus ") ? 11 : 1;
			const locations = await session.connection.sendRequest(
				DefinitionRequest.type,
				params(word, delta),
			);
			assert.ok(Array.isArray(locations) && locations.length > 0, word);
			const location = locations[0] as { uri: string; range: { start: { line: number } } };
			assert.ok(location.uri.endsWith(target), word);
			assert.equal(location.range.start.line, line, word);
		}
		assert.equal(
			await session.connection.sendRequest(DefinitionRequest.type, params("ui_test")),
			null,
		);
	});

	it("uses unsaved include contents and terminates include cycles", async () => {
		const includeUri = pathToFileURL(join(root, "common.inc")).href;
		await session.connection.sendNotification(DidOpenTextDocumentNotification.type, {
			textDocument: {
				uri: includeUri,
				languageId: "menu",
				version: 1,
				text: '\n#define WIDTH 320\n#include "common.inc"',
			},
		});
		const locations = await session.connection.sendRequest(DefinitionRequest.type, params("WIDTH"));
		assert.equal((locations as { range: { start: { line: number } } }[])[0].range.start.line, 1);
		assert.equal(
			await session.connection.sendRequest(DefinitionRequest.type, params("rect")),
			null,
		);
	});

	it("resolves nested includes only through content roots", async () => {
		const nestedUri = pathToFileURL(join(root, "ui_mp", "nested.menu")).href;
		const localUri = pathToFileURL(join(root, "ui_mp", "local.inc")).href;
		const nestedText = '#include "common.inc"\n#include "local.inc"\n{ loadMenu { "common.inc" } }';
		for (const [target, content] of [
			[nestedUri, nestedText],
			[localUri, "#define LOCAL 1"],
		])
			await session.connection.sendNotification(DidOpenTextDocumentNotification.type, {
				textDocument: { uri: target, languageId: "menu", version: 1, text: content },
			});
		const request = (line: number, character: number) =>
			session.connection.sendRequest(DefinitionRequest.type, {
				textDocument: { uri: nestedUri },
				position: { line, character },
			});
		for (const [line, character] of [
			[0, 12],
			[2, 18],
		]) {
			const result = await request(line, character);
			assert.equal(
				(result as { uri: string }[])[0].uri,
				pathToFileURL(join(root, "common.inc")).href,
			);
		}
		assert.equal(await request(1, 12), null);
	});

	it("navigates decoded names case-insensitively with original source ranges", async () => {
		const escapedUri = pathToFileURL(join(root, "escaped.menu")).href;
		const source = String.raw`{ menuDef { name "ma\in" onOpen { open MAIN; } } }`;
		await session.connection.sendNotification(DidOpenTextDocumentNotification.type, {
			textDocument: { uri: escapedUri, languageId: "menu", version: 1, text: source },
		});
		const result = await session.connection.sendRequest(DefinitionRequest.type, {
			textDocument: { uri: escapedUri },
			position: { line: 0, character: source.indexOf("MAIN") + 1 },
		});
		const location = (
			result as { range: { start: { character: number }; end: { character: number } } }[]
		)[0];
		assert.equal(
			source.slice(location.range.start.character, location.range.end.character),
			String.raw`"ma\in"`,
		);
	});

	it("returns RGBA colors and menu-formatted color edits", async () => {
		const colors = await session.connection.sendRequest(DocumentColorRequest.type, {
			textDocument: { uri },
		});
		assert.equal(colors.length, 1);
		assert.deepEqual(colors[0].color, { red: 1, green: 0.5, blue: 0, alpha: 0.25 });
		const edits = (await session.connection.sendRequest("textDocument/colorPresentation", {
			textDocument: { uri },
			...colors[0],
		})) as { label: string }[];
		assert.equal(edits[0].label, "1 0.5 0 0.25");
	});

	it("provides a nested outline, folds and semantic tokens", async () => {
		const symbols = (await session.connection.sendRequest("textDocument/documentSymbol", {
			textDocument: { uri },
		})) as { name: string; children: { name: string }[] }[];
		assert.deepEqual(
			symbols.map((s) => s.name),
			["enabled", "main"],
		);
		assert.equal(symbols[1].children[0].name, "button");
		const folds = (await session.connection.sendRequest("textDocument/foldingRange", {
			textDocument: { uri },
		})) as unknown[];
		assert.ok(folds.length >= 3);
		const tokens = await session.connection.sendRequest(SemanticTokensRequest.type, {
			textDocument: { uri },
		});
		assert.ok(tokens!.data.length > 0);
	});

	it("never runs GSC signature help or inlay hints for menus", async () => {
		assert.equal(
			await session.connection.sendRequest(SignatureHelpRequest.type, params("enabled()", 8)),
			null,
		);
		assert.equal(
			await session.connection.sendRequest(InlayHintRequest.type, {
				textDocument: { uri },
				range: { start: { line: 0, character: 0 }, end: { line: 16, character: 0 } },
			}),
			null,
		);
	});

	it("publishes versioned diagnostics, clears them after editing and on close", async () => {
		const badUri = pathToFileURL(join(root, "broken.menu")).href;
		const diagnostics: { uri: string; version?: number; diagnostics: unknown[] }[] = [];
		const subscription = session.connection.onNotification(
			"textDocument/publishDiagnostics",
			(params) => {
				diagnostics.push(params);
			},
		);
		await session.connection.sendNotification(DidOpenTextDocumentNotification.type, {
			textDocument: { uri: badUri, languageId: "plaintext", version: 1, text: "{ menuDef {" },
		});
		await session.connection.sendRequest(HoverRequest.type, {
			textDocument: { uri: badUri },
			position: { line: 0, character: 3 },
		});
		assert.ok(
			diagnostics.some((d) => d.uri === badUri && d.version === 1 && d.diagnostics.length > 0),
		);
		await session.connection.sendNotification(DidChangeTextDocumentNotification.type, {
			textDocument: { uri: badUri, version: 2 },
			contentChanges: [{ text: '{ menuDef { name "fixed" } }' }],
		});
		await session.connection.sendRequest(HoverRequest.type, {
			textDocument: { uri: badUri },
			position: { line: 0, character: 3 },
		});
		assert.ok(
			diagnostics.some((d) => d.uri === badUri && d.version === 2 && d.diagnostics.length === 0),
		);
		await session.connection.sendNotification("textDocument/didClose", {
			textDocument: { uri: badUri },
		});
		await session.connection.sendRequest(HoverRequest.type, params("forecolor"));
		assert.deepEqual(diagnostics.at(-1)?.diagnostics, []);
		subscription.dispose();
	});
});
