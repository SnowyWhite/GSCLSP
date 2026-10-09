import { basename } from "node:path";
import {
	type CallableDef,
	type CallableDefScript,
	type Engine,
	type ScriptDir,
	type Snippet,
	getLineText,
	removeFileExtension,
	uriToFsPath,
} from "@gsc-language-server/core";
import {
	type CancellationToken,
	type CompletionItem,
	CompletionItemKind,
	type CompletionList,
	type CompletionParams,
	InsertTextFormat,
} from "vscode-languageserver";

import type { DocumentContext, Server } from "../context";
import { createDocumentation, createUsage } from "./shared";

export const completionTriggerCharacters = ["\\", ":"];

/** Identifies a callable completion item's definition, so documentation can be resolved lazily. */
type CallableCompletionData =
	| { origin: "game"; engineId: Engine["id"]; name: string }
	| { origin: "script"; engineId: Engine["id"]; uri: string; name: string };

const retriggerCommand = { command: "editor.action.triggerSuggest", title: "Retrigger Suggest" };

export const provideCompletionItems = async (
	server: Server,
	{ document, engine, file, settings }: DocumentContext,
	{ position, context }: CompletionParams,
	token: CancellationToken,
): Promise<CompletionList | undefined> => {
	const { stores } = server;
	const filesystem = await stores.gsc.getFilesystem(engine.id);
	const script = filesystem.getScriptByFile(file);
	if (context?.triggerCharacter === ":") {
		// only trigger on double colon
		if (position.character < 2) return;
		const withPrev = document.getText({
			start: { line: position.line, character: position.character - 2 },
			end: position,
		});
		if (withPrev !== "::") return;
	}

	const textSegments = await file.getTextSegments();
	if (token.isCancellationRequested) return;
	if (textSegments.hasAt(position)) return;

	const { intelliSense } = settings;
	const snippetSupport =
		server.capabilities.textDocument?.completion?.completionItem?.snippetSupport ?? false;
	const items: CompletionItem[] = [];

	const createKeywords = () => {
		if (!intelliSense.enable.keywords) return;
		for (const keyword of stores.static.getKeywords(engine.id)) {
			items.push({ label: keyword, kind: CompletionItemKind.Keyword });
		}
	};

	const createSnippets = () => {
		if (!snippetSupport) return;
		for (const snippet of stores.static.getSnippets(engine.id)) {
			items.push(createSnippetCompletionItem(snippet));
		}
	};

	const createCallablesGame = () => {
		const enableCallablesGame = intelliSense.enable.callablesGame;
		if (enableCallablesGame === "off") return;
		for (const [, def] of stores.static.getCallableDefs(engine.id)) {
			if (def.deprecated && enableCallablesGame === "non-deprecated") continue;
			items.push(
				createCallableCompletionItem(def, {
					origin: "game",
					engineId: engine.id,
					name: def.name.text,
				}),
			);
		}
	};

	const createCallablesScript = (defs: Iterable<CallableDefScript>) => {
		if (!intelliSense.enable.callablesScript) return;
		for (const def of defs) {
			const data = {
				origin: "script",
				engineId: engine.id,
				uri: def.file.uri,
				name: def.name.text,
			} as const;
			items.push(
				createCallableCompletionItem(def, data, {
					local: def.file === file,
					scriptPath: filesystem.getScriptByFile(def.file)?.path,
				}),
			);
		}
	};

	const createCallablesScope = async () => {
		const defsScope = script
			? await script.getCallableDefsScope()
			: (await file.getCallableDefs()).byName;
		if (token.isCancellationRequested) return;
		createCallablesGame();
		createCallablesScript(defsScope.values());
	};

	const createGscScripts = (scriptDir: ScriptDir, isDirective = false) => {
		const foldersToTop = intelliSense.foldersSorting === "top";
		const filesToTop = intelliSense.foldersSorting === "bottom";
		for (const [foldername] of scriptDir.children) {
			items.push(createFolderCompletionItem(foldername, foldersToTop));
		}
		for (const [, script] of scriptDir.scripts) {
			const file = filesystem.getFileByScript(script);
			if (!file) continue;
			const filename = basename(uriToFsPath(file.uri) ?? file.uri);
			items.push(createFileCompletionItem(filename, filesToTop, !isDirective));
		}
	};

	/** Text of the line before `offset`, extended by preceding lines while it is only whitespace. */
	const createWhitespaceLinesReader = (startLineIndex: number) => {
		let lineIndex = startLineIndex;
		let text = getLineText(document, lineIndex);
		return (offset: number) => {
			text = text.slice(0, offset);
			if (!/^\s*$/.test(text)) return text;
			while (lineIndex > 0) {
				lineIndex--;
				const lineText = getLineText(document, lineIndex);
				text = `${lineText}\n${text}`;
				if (lineText.trim().length > 0) break;
			}
			return text;
		};
	};

	const getItems = async () => {
		const readLines = createWhitespaceLinesReader(position.line);
		const preCursorText = readLines(position.character);

		// scope resolution (::)
		const scopeResSeparatorMatch = preCursorText.match(/::\s*([A-Za-z_][\w]*)?$/);
		if (scopeResSeparatorMatch) {
			const preSeparatorText = readLines(scopeResSeparatorMatch.index!);
			const scriptPath = preSeparatorText.match(/([\w\\]*\w)\s*$/)?.[1] ?? "";
			if (!scriptPath) {
				await createCallablesScope();
				return;
			}
			const file = filesystem.getScriptByPath(scriptPath)?.file;
			if (!file) return;
			const defs = await file.getCallableDefs();
			if (token.isCancellationRequested) return;
			createCallablesScript(defs.byName.values());
			return;
		}

		// scope script paths
		const partialScriptMatch = preCursorText.match(/\w[\w\\]*$/);
		const partialScriptPath = partialScriptMatch?.[0] ?? "";
		const lastSlashIndex = partialScriptPath.lastIndexOf("\\");
		const parentScriptPath =
			lastSlashIndex !== -1 ? partialScriptPath.slice(0, lastSlashIndex) : "";

		const scriptDir = filesystem.getScriptDirByPath(parentScriptPath);
		if (!scriptDir) return;
		const preScriptPathText = partialScriptMatch
			? readLines(partialScriptMatch.index!)
			: preCursorText;
		const isDirective = /#[a-z_]+\s+/.test(preScriptPathText);
		createGscScripts(scriptDir, isDirective);
		if (scriptDir.parent || isDirective) return;

		createKeywords();
		createSnippets();
		await createCallablesScope();
	};

	await getItems();
	if (token.isCancellationRequested) return;
	return { isIncomplete: false, items };
};

/** Adds the documentation of callable items, which is too large to send for every item upfront. */
export const resolveCompletionItem = async (
	server: Server,
	item: CompletionItem,
): Promise<CompletionItem> => {
	const data = item.data as CallableCompletionData | undefined;
	if (!data) return item;
	const engine = server.stores.engines.find(({ id }) => id === data.engineId);
	if (!engine) return item;

	const def = await (async (): Promise<CallableDef | undefined> => {
		const name = data.name.toLowerCase();
		if (data.origin === "game") return server.stores.static.getCallableDefs(engine.id).get(name);
		const file = server.stores.gsc.getFile(data.uri);
		return (await file?.getCallableDefs())?.byName.get(name);
	})();
	if (!def) return item;

	const concise = server.stores.settings.intelliSense.conciseMode;
	return { ...item, documentation: createDocumentation(def, engine.languageId, { concise }) };
};

const createCallableCompletionItem = (
	def: CallableDef,
	data: CallableCompletionData,
	options: { local?: boolean; scriptPath?: string } = {},
): CompletionItem => {
	const isGame = def.origin === "game";
	const description = options.local ? undefined : isGame ? def.module : options.scriptPath;
	return {
		label: def.name.text,
		labelDetails: description ? { description } : undefined,
		detail: createUsage(def),
		kind: def.receiver ? CompletionItemKind.Method : CompletionItemKind.Function,
		data,
	};
};

const createSnippetCompletionItem = (snippet: Snippet): CompletionItem => ({
	label: snippet.prefix,
	detail: snippet.description,
	kind: CompletionItemKind.Snippet,
	insertText: snippet.body,
	insertTextFormat: InsertTextFormat.Snippet,
});

const createFolderCompletionItem = (foldername: string, sortToTop = false): CompletionItem => ({
	label: `${foldername}\\`,
	sortText: sortToTop ? ` ${foldername}` : undefined,
	command: retriggerCommand,
	kind: CompletionItemKind.Folder,
});

const createFileCompletionItem = (
	filename: string,
	sortToTop = false,
	addSeparator = true,
): CompletionItem => ({
	label: filename,
	sortText: sortToTop ? `\u0000${filename}` : undefined,
	insertText: `${removeFileExtension(filename)}${addSeparator ? "::" : ""}`,
	command: addSeparator ? retriggerCommand : undefined,
	filterText: `\\${filename}`,
	kind: CompletionItemKind.File,
});
