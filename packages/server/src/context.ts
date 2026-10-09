import type { Engine, GscFile, Settings, Stores } from "@gsclsp/core";
import type { ClientCapabilities, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

export type Server = {
	readonly stores: Stores;
	readonly documents: TextDocuments<TextDocument>;
	readonly capabilities: ClientCapabilities;
	/** URI of a file as the client knows it (the URI it opened the document with, if open). */
	toClientUri(file: GscFile): string;
};

/** Everything a request handler needs to know about the document it was invoked on. */
export type DocumentContext = {
	readonly document: TextDocument;
	readonly engine: Engine;
	readonly file: GscFile;
	readonly settings: Settings;
};

export const getDocumentContext = (server: Server, uri: string): DocumentContext | undefined => {
	const document = server.documents.get(uri);
	if (!document) return undefined;
	const { stores } = server;
	return {
		document,
		engine: stores.resolveEngine(uri, document.languageId),
		file: stores.gsc.ensureFile(uri),
		settings: stores.settings,
	};
};
