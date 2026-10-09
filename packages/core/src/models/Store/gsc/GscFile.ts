import { readFile } from "node:fs/promises";
import { TextDocument as DiskDocument } from "vscode-languageserver-textdocument";

import type { CancellationToken } from "../../../cancellation";
import type { TextDocument } from "../../../text";
import { uriToFsPath } from "../../../uri";
import { Cache } from "../../Cache/Cache";

import type { CallableDefScript, CallableUsage } from "../../Callable";
import type { Include } from "../../Include";
import type { SegmentMap, SegmentTree } from "../../Segment";
import type { TextSegment } from "../../SegmentTypes";

import { parseCallableDefs } from "../../../parse/callableDefs";
import { parseCallableUsages } from "../../../parse/callableUsages";
import { parseGlobalSegments } from "../../../parse/globalSegments";
import { parseIncludes } from "../../../parse/includes";
import { parseTextSegments } from "../../../parse/textSegments";

/** Looks up editor buffers by normalized URI. */
export interface OpenDocuments {
	get(uri: string): TextDocument | undefined;
}

export class GscFile {
	/** Normalized URI (see `normalizeUri`). */
	readonly uri: string;
	private readonly openDocuments: OpenDocuments;
	private readonly cache: Cache<{
		textSegments: SegmentMap<TextSegment>;
		globalSegments: SegmentMap;
		includes: Readonly<{
			byRange: SegmentMap<Include>;
			paths: string[];
		}>;
		callableDefs: Readonly<{
			byRange: SegmentMap<CallableDefScript>;
			byName: ReadonlyMap<string, CallableDefScript>;
		}>;
		callableUsages: SegmentTree<CallableUsage>;
	}>;

	constructor(uri: string, openDocuments: OpenDocuments) {
		this.uri = uri;
		this.openDocuments = openDocuments;
		this.cache = new Cache();
	}

	/** The open editor buffer if there is one, otherwise the file contents on disk. */
	async getDocument(): Promise<TextDocument> {
		const openDocument = this.openDocuments.get(this.uri);
		if (openDocument) return openDocument;

		const fsPath = uriToFsPath(this.uri);
		if (!fsPath) throw new Error(`Document ${this.uri} is neither open nor on disk.`);
		// Game scripts are Windows-1252 encoded. Latin-1 maps every byte to one character, which keeps
		// offsets identical for the ASCII source text that matters to the parsers.
		const text = await readFile(fsPath, "latin1");
		return DiskDocument.create(this.uri, "gsc", 0, text);
	}

	getTextSegments() {
		return this.cache.getAsync("textSegments", async (token: CancellationToken) => {
			const doc = await this.getDocument();
			if (token.isCancellationRequested) return;
			return parseTextSegments(doc);
		});
	}

	getGlobalSegments() {
		return this.cache.getAsync("globalSegments", async (token: CancellationToken) => {
			const doc = await this.getDocument();
			if (token.isCancellationRequested) return;
			const textSegments = await this.getTextSegments();
			return parseGlobalSegments(doc, textSegments);
		});
	}

	getIncludes() {
		return this.cache.getAsync("includes", async (token: CancellationToken) => {
			const doc = await this.getDocument();
			if (token.isCancellationRequested) return;
			return parseIncludes(doc, await this.getGlobalSegments(), await this.getTextSegments());
		});
	}

	getCallableDefs() {
		return this.cache.getAsync("callableDefs", async (token: CancellationToken) => {
			const doc = await this.getDocument();
			if (token.isCancellationRequested) return;
			const defs = parseCallableDefs(
				doc,
				await this.getGlobalSegments(),
				await this.getTextSegments(),
				this,
			);

			const byName = new Map<string, CallableDefScript>();
			for (const { value: def } of defs) {
				byName.set(def.name.text.toLowerCase(), def);
			}

			return { byRange: defs, byName };
		});
	}

	getCallableUsages() {
		return this.cache.getAsync("callableUsages", async (token: CancellationToken) => {
			const doc = await this.getDocument();
			if (token.isCancellationRequested) return;

			return parseCallableUsages(doc, await this.getGlobalSegments(), await this.getTextSegments());
		});
	}

	onChanged() {
		this.cache.clear();
	}
}
