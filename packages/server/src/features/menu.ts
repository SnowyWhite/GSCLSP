import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
	type MenuModel,
	type MenuToken,
	menuCatalog,
	menuEntry,
	menuRange,
	menuScopeAt,
	menuTokenValue,
	normalizeUri,
	parseMenu,
} from "@gsclsp/core";
import {
	type CancellationToken,
	type ColorInformation,
	type ColorPresentationParams,
	type CompletionItem,
	CompletionItemKind,
	DiagnosticSeverity,
	type DocumentSymbol,
	type FoldingRange,
	MarkupKind,
	type Position,
	type Range,
	SemanticTokensBuilder,
	SymbolKind,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { Server } from "../context";
import { semanticTokensLegend } from "./semanticTokens";

const cache = new WeakMap<TextDocument, { version: number; model: MenuModel }>();
export const menuModel = (document: TextDocument) => {
	let entry = cache.get(document);
	if (!entry || entry.version !== document.version) {
		entry = { version: document.version, model: parseMenu(document.getText()) };
		cache.set(document, entry);
	}
	return entry.model;
};

const tokenAt = (model: MenuModel, offset: number) =>
	model.tokens.find((t) => t.start <= offset && offset < t.end);

export const menuDiagnostics = (document: TextDocument) =>
	menuModel(document).issues.map((issue) => ({
		range: menuRange(document, issue),
		message: issue.message,
		severity: DiagnosticSeverity.Error,
		source: "gsclsp-menu",
	}));

export function menuCompletion(document: TextDocument, position: Position) {
	const model = menuModel(document);
	const offset = document.offsetAt(position);
	const current = tokenAt(model, offset) ?? model.tokens.find((t) => t.end === offset);
	if (
		current &&
		["comment", "string"].includes(current.kind) &&
		offset > current.start &&
		(offset < current.end || current.kind === "comment")
	)
		return [];
	const scope = menuScopeAt(model, offset);
	const line = document.getText({ start: { line: position.line, character: 0 }, end: position });
	const compound = /\bexp(?:[ \t]+\w*){0,2}$/i.exec(line)?.[0];
	const prefix = compound ?? /[#\w]+$/.exec(line)?.[0] ?? "";
	const range = {
		start: document.positionAt(offset - prefix.length),
		end:
			current?.kind === "word" && current.end > offset
				? document.positionAt(current.end)
				: position,
	};
	const directive = /^\s*#/.test(line);
	if (directive && !/^\s*#\w*$/.test(line)) return [];
	const entries = menuCatalog.filter((entry) =>
		directive
			? entry.scope === "directive"
			: compound
				? entry.scope === scope && entry.name.startsWith("exp ")
				: entry.scope === scope ||
					(entry.scope === "expression" && ["menu", "item", "function", "event"].includes(scope)),
	);
	const items: CompletionItem[] = entries.map((entry) => ({
		label: entry.name,
		kind:
			entry.kind === "function" || entry.kind === "command"
				? CompletionItemKind.Function
				: CompletionItemKind.Keyword,
		detail: `IW4 ${entry.scope}: ${entry.syntax}`,
		documentation: {
			kind: MarkupKind.Markdown,
			value: `\`\`\`menu\n${entry.syntax}\n\`\`\`${entry.description ? `\n\n${entry.description}` : ""}`,
		},
		textEdit: { range, newText: entry.name },
	}));
	if (!directive && !compound) {
		for (const def of model.definitions) {
			if (def.kind !== "macro" && def.kind !== "function") continue;
			items.push({
				label: def.name,
				kind: def.kind === "macro" ? CompletionItemKind.Constant : CompletionItemKind.Function,
				detail: `${def.kind} defined in this file`,
				documentation: { kind: MarkupKind.Markdown, value: `Local ${def.kind} \`${def.name}\`.` },
				textEdit: { range, newText: def.name },
			});
		}
	}
	return items;
}

export function menuHover(document: TextDocument, position: Position) {
	const model = menuModel(document);
	const t = tokenAt(model, document.offsetAt(position));
	if (!t || t.kind !== "word") return null;
	const entry =
		menuEntry(t.text, t.scope) ??
		menuCatalog.find(
			(e) => e.scope === "expression" && e.name.toLowerCase() === t.text.toLowerCase(),
		);
	if (!entry) {
		const def = model.definitions.find((d) => d.kind === "macro" && d.name === t.text);
		if (!def) return null;
		const directive = model.tokens.find(
			(token) => token.kind === "directive" && token.start < def.start && token.end >= def.end,
		)!;
		return {
			range: menuRange(document, t),
			contents: {
				kind: MarkupKind.Markdown,
				value: `\`\`\`menu\n${directive.text.trim()}\n\`\`\``,
			},
		};
	}
	return {
		range: menuRange(document, t),
		contents: {
			kind: MarkupKind.Markdown,
			value: `\`\`\`menu\n${entry.syntax}\n\`\`\`\n\nIW4 ${entry.scope} ${entry.kind}.${entry.description ? `\n\n${entry.description}` : ""}`,
		},
	};
}

/** OAT resolves includes against content roots, not the source directory. */
async function includedDocument(server: Server, document: TextDocument, path: string) {
	const engine = server.stores.resolveEngine(document.uri);
	const roots = server.stores.gsc.getRootDirectories(engine.id);
	for (const root of roots) {
		const file = resolve(root, path.replaceAll("\\", "/"));
		const uri = pathToFileURL(file).href;
		const open = server.documents.all().find((doc) => normalizeUri(doc.uri) === normalizeUri(uri));
		if (open) return open;
		try {
			// Bound accidental navigation into huge assets, and never read devices or FIFOs.
			const info = await stat(file);
			if (!info.isFile() || info.size > 2 * 1024 * 1024) continue;
			const text = new TextDecoder("windows-1252").decode(await readFile(file));
			return TextDocument.create(uri, "menu", 0, text);
		} catch {
			// A missing include may be supplied by a later search root.
		}
	}
	return undefined;
}

export async function menuDefinition(
	server: Server,
	document: TextDocument,
	position: Position,
	cancellation: CancellationToken,
) {
	const model = menuModel(document);
	const offset = document.offsetAt(position);
	const include = model.includes.find((inc) => inc.start <= offset && offset <= inc.end);
	if (include) {
		const target = await includedDocument(server, document, include.path);
		return target ? [{ uri: target.uri, range: menuRange(target, { start: 0, end: 0 }) }] : null;
	}
	const t = tokenAt(model, offset);
	if (!t || !["word", "string"].includes(t.kind)) return null;
	const code = model.tokens.filter((token) => !["comment", "directive"].includes(token.kind));
	const index = code.indexOf(t);
	const previous = code[index - 1]?.text.toLowerCase();
	const name = menuTokenValue(t);
	// Restrict named navigation to actual UI references, not arbitrary text/dvar strings.
	const kind =
		code[index + 1]?.text === "("
			? "function"
			: ["open", "close", "showmenu", "hidemenu", "ingameopen", "ingameclose"].includes(previous) &&
					t.scope === "event"
				? "menu"
				: ["setfocus", "show", "hide", "fadein", "fadeout", "setitemcolor"].includes(previous) &&
						t.scope === "event"
					? "item"
					: "macro";
	if (t.kind === "string" && kind === "macro") return null;
	const visited = new Set<string>();
	let budget = 64;
	const search = async (
		doc: TextDocument,
		depth: number,
	): Promise<{ uri: string; range: Range } | undefined> => {
		const uri = normalizeUri(doc.uri);
		if (visited.has(uri) || depth > 16 || budget-- <= 0 || cancellation.isCancellationRequested)
			return undefined;
		visited.add(uri);
		const parsed = menuModel(doc);
		const owner = model.blocks
			.filter((b) => b.scope === "menu" && b.start <= offset && offset < b.end)
			.at(-1);
		const found = parsed.definitions.find(
			(d) =>
				(d.kind === kind || (kind === "function" && d.kind === "macro")) &&
				(d.kind === "macro" ? d.name === name : d.name.toLowerCase() === name.toLowerCase()) &&
				(kind !== "item" || (doc === document && d.block?.parent === owner)),
		);
		if (found) return { uri: doc.uri, range: menuRange(doc, found) };
		for (const inc of parsed.includes) {
			if (cancellation.isCancellationRequested || budget <= 0) break;
			const next = await includedDocument(server, doc, inc.path);
			if (!next) continue;
			const result = await search(next, depth + 1);
			if (result) return result;
		}
		return undefined;
	};
	const result = await search(document, 0);
	return result ? [result] : null;
}

export function menuSymbols(document: TextDocument): DocumentSymbol[] {
	const model = menuModel(document);
	const symbols = new Map<object, DocumentSymbol>();
	const result: DocumentSymbol[] = [];
	for (const def of model.definitions) {
		const symbol: DocumentSymbol = {
			name: def.name,
			kind:
				def.kind === "macro"
					? SymbolKind.Constant
					: def.kind === "function"
						? SymbolKind.Function
						: SymbolKind.Object,
			range: menuRange(document, def.block ?? def),
			selectionRange: menuRange(document, def),
			children: [],
		};
		if (def.block) symbols.set(def.block, symbol);
		const parent = def.block?.parent && symbols.get(def.block.parent);
		if (parent) parent.children!.push(symbol);
		else result.push(symbol);
	}
	return result;
}

export function menuFolding(document: TextDocument): FoldingRange[] {
	return menuModel(document).blocks.flatMap((block) => {
		const range = menuRange(document, block);
		return range.end.line > range.start.line
			? [{ startLine: range.start.line, endLine: range.end.line - 1 }]
			: [];
	});
}

export function menuTokens(document: TextDocument, range?: Range) {
	const builder = new SemanticTokensBuilder();
	const model = menuModel(document);
	const start = range ? document.offsetAt(range.start) : 0;
	const end = range ? document.offsetAt(range.end) : document.getText().length;
	const macroNames = new Set(
		model.definitions.filter((d) => d.kind === "macro").map((d) => d.name),
	);
	for (const t of model.tokens) {
		const type =
			t.kind === "word"
				? menuEntry(t.text, t.scope)
					? "keyword"
					: menuCatalog.some(
								(e) => e.scope === "expression" && e.name.toLowerCase() === t.text.toLowerCase(),
							)
						? "function"
						: macroNames.has(t.text)
							? "macro"
							: undefined
				: t.kind === "directive"
					? "macro"
					: t.kind === "punctuation"
						? undefined
						: t.kind;
		if (!type) continue;
		// LSP tokens cannot span lines, and range requests must not color outside the range.
		let at = Math.max(start, t.start);
		const limit = Math.min(end, t.end);
		while (at < limit) {
			const pos = document.positionAt(at);
			const next = Math.min(limit, document.offsetAt({ line: pos.line + 1, character: 0 }));
			const length = document
				.getText()
				.slice(at, next)
				.replace(/[\r\n]+$/, "").length;
			if (length)
				builder.push(
					pos.line,
					pos.character,
					length,
					semanticTokensLegend.tokenTypes.indexOf(type),
					0,
				);
			if (next <= at) break;
			at = next;
		}
	}
	return builder.build();
}

export function menuColors(document: TextDocument): ColorInformation[] {
	const tokens = menuModel(document).tokens.filter((t) => t.kind !== "comment");
	const result: ColorInformation[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		const entry = menuEntry(t.text, t.scope);
		if (
			t.kind !== "word" ||
			!["menu", "item"].includes(t.scope) ||
			!entry?.syntax.endsWith("r [g [b [a]]]") ||
			tokens[i - 1]?.text.toLowerCase() === "exp"
		)
			continue;
		const values: MenuToken[] = [];
		let next = i + 1;
		while (values.length < 4 && tokens[next]?.kind === "number") values.push(tokens[next++]);
		// Only offer edits for a complete literal property. A following macro,
		// operator or parenthesis may supply another component/expression.
		const boundary = tokens[next];
		if (
			!values.length ||
			values.some((v) => Number(v.text) < 0 || Number(v.text) > 1) ||
			(boundary &&
				boundary.text !== "}" &&
				!(boundary.kind === "word" && menuEntry(boundary.text, t.scope)))
		)
			continue;
		const [red, green = 0, blue = 0, alpha = 0] = values.map((v) => Number(v.text));
		result.push({
			range: menuRange(document, { start: values[0].start, end: values.at(-1)!.end }),
			color: { red, green, blue, alpha },
		});
	}
	return result;
}

export function menuColorPresentations({ color, range }: ColorPresentationParams) {
	const label = [color.red, color.green, color.blue, color.alpha]
		.map((c) => Number(c.toFixed(4)))
		.join(" ");
	return [{ label, textEdit: { range, newText: label } }];
}
