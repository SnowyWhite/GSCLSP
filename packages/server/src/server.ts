import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
	SETTINGS_SECTION,
	type Settings,
	Stores,
	loadEngines,
	normalizeUri,
	uriToFsPath,
} from "@gsclsp/core";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
	DidChangeConfigurationNotification,
	MessageType,
	ProposedFeatures,
	ShowMessageNotification,
	TextDocumentSyncKind,
	TextDocuments,
	createConnection,
} from "vscode-languageserver/node";

import { version } from "../package.json";
import { Configuration } from "./configuration";
import { type DocumentContext, type Server, getDocumentContext } from "./context";
import { RootDirectoriesWatcher } from "./watcher";

import { provideColorPresentations, provideDocumentColors } from "./features/color";
import {
	completionTriggerCharacters,
	provideCompletionItems,
	resolveCompletionItem,
} from "./features/completionItem";
import { provideDefinition } from "./features/definition";
import { provideHover } from "./features/hover";
import { provideInlayHints } from "./features/inlayHints";
import { provideSemanticTokens, semanticTokensLegend } from "./features/semanticTokens";
import { provideSignatureHelp } from "./features/signatureHelp";

// Transport arguments (--stdio, --node-ipc, --socket=) are read by `createConnection`.
const args = parseArgs({
	options: { data: { type: "string" } },
	strict: false,
	allowPositionals: true,
}).values;
// The data directory ships next to the bundled server (or the standalone executable).
const dataDir = typeof args.data === "string" ? resolve(args.data) : join(__dirname, "data");

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
/** Open documents by normalized URI. */
const openDocuments = new Map<string, TextDocument>();

let server: Server;
let configuration: Configuration;
let watcher: RootDirectoriesWatcher;
/** Workspace folder URIs; the default engine's fallback root directories. */
let workspaceFolderUris: string[] = [];

/**
 * Resolves once the client settings were first applied. Requests wait for it, as they would
 * otherwise run without root directories (and cache the result). Executor form instead of
 * `Promise.withResolvers`, which Node.js 20 lacks.
 */
let onSettingsReady!: () => void;
const settingsReady = new Promise<void>((resolve) => {
	onSettingsReady = resolve;
});

connection.onInitialize(
	async ({ capabilities, initializationOptions, workspaceFolders, rootUri }) => {
		const engines = await loadEngines(dataDir);
		configuration = new Configuration(connection, engines, capabilities, initializationOptions);

		const stores = new Stores({
			engines,
			dataDir,
			settings: configuration.settings,
			openDocuments: { get: (uri) => openDocuments.get(uri) },
			// A notification (`window/showMessage`): the server does not wait for the user to react.
			warn: (message) =>
				connection.sendNotification(ShowMessageNotification.type, {
					type: MessageType.Warning,
					message,
				}),
		});
		await stores.init();
		workspaceFolderUris = workspaceFolders?.map(({ uri }) => uri) ?? (rootUri ? [rootUri] : []);
		stores.gsc.setWorkspaceFolders(workspaceFolderUris.flatMap((uri) => uriToFsPath(uri) ?? []));

		server = {
			stores,
			documents,
			capabilities,
			toClientUri: (file) => openDocuments.get(file.uri)?.uri ?? file.uri,
		};
		watcher = new RootDirectoriesWatcher(connection, capabilities, (fsPath, kind) =>
			stores.gsc.onFileEvent(fsPath, kind),
		);

		return {
			capabilities: {
				textDocumentSync: TextDocumentSyncKind.Incremental,
				definitionProvider: true,
				colorProvider: true,
				completionProvider: {
					triggerCharacters: completionTriggerCharacters,
					resolveProvider: true,
				},
				hoverProvider: true,
				signatureHelpProvider: { triggerCharacters: ["(", ","] },
				semanticTokensProvider: { legend: semanticTokensLegend, full: true, range: true },
				inlayHintProvider: true,
				workspace: { workspaceFolders: { supported: true, changeNotifications: true } },
			},
			serverInfo: { name: "gsclsp", version },
		};
	},
);

connection.onInitialized(async () => {
	const { capabilities } = server;
	if (
		configuration.supportsPull &&
		capabilities.workspace?.didChangeConfiguration?.dynamicRegistration
	) {
		// Not awaited: a client failing the registration must not keep requests waiting for settings.
		connection.client
			.register(DidChangeConfigurationNotification.type, { section: SETTINGS_SECTION })
			.catch((error) =>
				connection.console.error(`Registering for configuration changes: ${error}`),
			);
	}
	if (capabilities.workspace?.workspaceFolders) {
		connection.workspace.onDidChangeWorkspaceFolders(async ({ added, removed }) => {
			const removedUris = new Set(removed.map(({ uri }) => uri));
			workspaceFolderUris = [
				...workspaceFolderUris.filter((uri) => !removedUris.has(uri)),
				...added.map(({ uri }) => uri),
			];
			const { stores } = server;
			stores.gsc.setWorkspaceFolders(workspaceFolderUris.flatMap((uri) => uriToFsPath(uri) ?? []));
			await applyRootDirectories();
		});
	}
	try {
		await applySettings(await configuration.refresh());
	} finally {
		onSettingsReady();
	}
});

connection.onDidChangeConfiguration(async ({ settings }) => {
	await applySettings(await configuration.refresh(settings));
});

const applySettings = async (settings: Settings) => {
	server.stores.settings = settings;
	await applyRootDirectories();
};

/** Watches and scans the current root directories, then lets the client refresh derived views. */
const applyRootDirectories = async () => {
	const { stores, capabilities } = server;
	const roots = stores.engines.flatMap((engine) => stores.gsc.getRootDirectories(engine.id));
	await watcher.update(roots);

	// Scan root directories ahead of the first request (this also reports invalid directories):
	for (const engine of stores.engines) {
		if (stores.gsc.getRootDirectories(engine.id).length === 0) continue;
		stores.gsc.getFilesystem(engine.id).catch((error) => {
			connection.console.error(`Scanning ${engine.id} root directories failed: ${error}`);
		});
	}

	if (capabilities.workspace?.semanticTokens?.refreshSupport) {
		await connection.languages.semanticTokens.refresh();
	}
	if (capabilities.workspace?.inlayHint?.refreshSupport) {
		await connection.languages.inlayHint.refresh();
	}
};

documents.onDidOpen(({ document }) => {
	openDocuments.set(normalizeUri(document.uri), document);
	server.stores.gsc.onDocumentChanged(document.uri);
});
documents.onDidChangeContent(({ document }) => {
	openDocuments.set(normalizeUri(document.uri), document);
	server.stores.gsc.onDocumentChanged(document.uri);
});
documents.onDidClose(({ document }) => {
	openDocuments.delete(normalizeUri(document.uri));
	server.stores.gsc.onDocumentClosed(document.uri);
});

/** Runs a request handler for an open document, `null` if the document is unknown. */
const withDocument = async <R>(
	uri: string,
	handler: (context: DocumentContext) => R | Promise<R>,
): Promise<R | null> => {
	await settingsReady;
	const context = getDocumentContext(server, uri);
	return context ? handler(context) : null;
};

connection.onDefinition((params, token) =>
	withDocument(params.textDocument.uri, (context) =>
		provideDefinition(server, context, params, token),
	),
);
connection.onDocumentColor(
	async (params, token) =>
		(await withDocument(params.textDocument.uri, (context) =>
			provideDocumentColors(context, token),
		)) ?? [],
);
connection.onColorPresentation((params) => provideColorPresentations(params));
connection.onCompletion((params, token) =>
	withDocument(params.textDocument.uri, (context) =>
		provideCompletionItems(server, context, params, token),
	),
);
connection.onCompletionResolve((item) => resolveCompletionItem(server, item));
connection.onHover((params, token) =>
	withDocument(params.textDocument.uri, (context) => provideHover(server, context, params, token)),
);
connection.onSignatureHelp((params, token) =>
	withDocument(params.textDocument.uri, (context) =>
		provideSignatureHelp(server, context, params, token),
	),
);
connection.languages.semanticTokens.on((params, token) =>
	withDocument(params.textDocument.uri, (context) => provideSemanticTokens(server, context, token)),
);
connection.languages.semanticTokens.onRange((params, token) =>
	withDocument(params.textDocument.uri, (context) =>
		provideSemanticTokens(server, context, token, params.range),
	),
);
connection.languages.inlayHint.on((params, token) =>
	withDocument(params.textDocument.uri, (context) =>
		provideInlayHints(server, context, params, token),
	),
);

connection.onShutdown(() => watcher?.dispose());

documents.listen(connection);
connection.listen();
