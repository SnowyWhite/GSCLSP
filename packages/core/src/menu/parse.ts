import type { Range, TextDocument } from "../text";
import { type MenuScope, menuEntry } from "./catalog";

export type MenuToken = {
	text: string;
	start: number;
	end: number;
	kind: "word" | "string" | "number" | "comment" | "directive" | "punctuation";
	scope: MenuScope;
};
export type MenuBlock = {
	scope: MenuScope;
	bodyStart: number;
	closed: boolean;
	start: number;
	end: number;
	name?: MenuToken;
	parent?: MenuBlock;
};
export type MenuIssue = { start: number; end: number; message: string };
export type MenuInclude = { path: string; start: number; end: number };
export type MenuDefinition = {
	name: string;
	kind: "macro" | "menu" | "item" | "function";
	start: number;
	end: number;
	block?: MenuBlock;
};
export type MenuModel = ReturnType<typeof parseMenu>;

export const menuRange = (document: TextDocument, span: { start: number; end: number }): Range => ({
	start: document.positionAt(span.start),
	end: document.positionAt(span.end),
});

export function menuTokenValue(token: MenuToken): string {
	if (token.kind !== "string") return token.text;
	// OAT source escapes differ from the runtime event-string lexer. Keep the
	// original token/range intact and decode only its value for navigation.
	const value = token.text.slice(1, token.text.endsWith('"') ? -1 : undefined);
	const escapes: Record<string, string> = { r: "\r", n: "\n", t: "\t", f: "\f" };
	return value.replace(/\\(.)|\\$/g, (_, character: string | undefined) =>
		character === undefined ? "" : (escapes[character] ?? character),
	);
}

/**
 * An unexpanded source model: positions always refer to what the user is editing.
 * Macro bodies stay opaque, since a macro can intentionally contain half a block.
 * Unknown words are retained, not rejected (stock headers define most constants).
 */
export function parseMenu(text: string) {
	const tokens: MenuToken[] = [];
	const issues: MenuIssue[] = [];
	const includes: MenuInclude[] = [];
	const definitions: MenuDefinition[] = [];
	let preprocessed = false;
	let offset = 0;
	while (offset < text.length) {
		if (/\s/.test(text[offset])) {
			offset++;
			continue;
		}
		const start = offset;
		let kind: MenuToken["kind"] = "punctuation";
		if (text.startsWith("//", offset)) {
			kind = "comment";
			while (offset < text.length && text[offset] !== "\n") offset++;
		} else if (text.startsWith("/*", offset)) {
			kind = "comment";
			const end = text.indexOf("*/", offset + 2);
			offset = end < 0 ? text.length : end + 2;
			if (end < 0) issues.push({ start, end: start + 2, message: "Unterminated block comment." });
		} else if (text[offset] === "#") {
			kind = "directive";
			preprocessed = true;
			do {
				const end = text.indexOf("\n", offset);
				offset = end < 0 ? text.length : end + 1;
			} while (offset < text.length && /\\\r?\n$/.test(text.slice(start, offset)));
			const directive = text.slice(start, offset);
			const include = /^#\s*include\s*["<]([^">\r\n]+)[">]/.exec(directive);
			if (include) {
				const pathStart = start + include[0].indexOf(include[1]);
				includes.push({ path: include[1], start: pathStart, end: pathStart + include[1].length });
			}
			const define = /^#\s*define\s+([A-Za-z_]\w*)/.exec(directive);
			if (define) {
				const nameStart = start + define[0].lastIndexOf(define[1]);
				definitions.push({
					name: define[1],
					kind: "macro",
					start: nameStart,
					end: nameStart + define[1].length,
				});
			}
		} else if (text[offset] === '"') {
			kind = "string";
			offset++;
			let closed = false;
			while (offset < text.length && text[offset] !== "\n" && text[offset] !== "\r") {
				if (text[offset] === '"') {
					offset++;
					closed = true;
					break;
				}
				if (text[offset] === "\\" && offset + 1 < text.length && !/[\r\n]/.test(text[offset + 1]))
					offset++;
				offset++;
			}
			if (!closed) issues.push({ start, end: offset, message: "Unterminated string." });
		} else {
			const word = /^[A-Za-z_]\w*/.exec(text.slice(offset));
			const number = /^(?:0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(
				text.slice(offset),
			);
			if (word || number) {
				kind = word ? "word" : "number";
				offset += (word ?? number)![0].length;
			} else offset++;
		}
		tokens.push({ text: text.slice(start, offset), start, end: offset, kind, scope: "global" });
	}

	const blocks: MenuBlock[] = [];
	const stack: MenuBlock[] = [];
	const brackets: MenuToken[] = [];
	const structureIssues: MenuIssue[] = [];
	const code = tokens.filter((t) => t.kind !== "comment" && t.kind !== "directive");
	let pending: { scope: MenuScope; start: number } | undefined;
	for (let i = 0; i < code.length; i++) {
		const t = code[i];
		const parent = stack.at(-1);
		t.scope = parent?.scope ?? "global";
		const key = t.text.toLowerCase();
		if (t.kind === "word") {
			if (key === "loadmenu" && code[i + 1]?.text === "{" && code[i + 2]?.kind === "string") {
				const path = code[i + 2];
				includes.push({ path: menuTokenValue(path), start: path.start + 1, end: path.end - 1 });
			}
			const scope =
				key === "menudef"
					? "menu"
					: key === "itemdef"
						? "item"
						: key === "functiondef"
							? "function"
							: undefined;
			const entry = menuEntry(t.text, t.scope);
			if (scope) pending = { scope, start: t.start };
			else if (entry?.kind === "event" || (t.scope === "event" && ["if", "else"].includes(key)))
				pending = { scope: "event", start: t.start };
			else if (
				key === "loadmenu" ||
				entry?.syntax.includes("{ values }") ||
				["dvarstrlist", "dvarfloatlist"].includes(key)
			)
				pending = { scope: "values", start: t.start };
			if (key === "name" && parent && ["menu", "item", "function"].includes(parent.scope)) {
				const name = code[i + 1];
				if (name && (name.kind === "word" || name.kind === "string")) {
					parent.name = name;
					definitions.push({
						name: menuTokenValue(name),
						kind: parent.scope as "menu" | "item" | "function",
						start: name.start,
						end: name.end,
						block: parent,
					});
				}
			}
		}
		if (t.text === "{") {
			const block: MenuBlock = {
				bodyStart: t.end,
				closed: false,
				scope: pending?.scope ?? (parent?.scope === "event" ? "event" : "global"),
				start: pending?.start ?? t.start,
				end: text.length,
				parent,
			};
			blocks.push(block);
			stack.push(block);
			pending = undefined;
		} else if (t.text === "}") {
			const block = stack.pop();
			if (block) {
				block.end = t.end;
				block.closed = true;
			}
			pending = undefined;
		} else if (t.text === ";") pending = undefined;
		if (["{", "(", "["].includes(t.text)) brackets.push(t);
		if (["}", ")", "]"].includes(t.text)) {
			const expected = { "}": "{", ")": "(", "]": "[" }[t.text];
			if (brackets.at(-1)?.text === expected) brackets.pop();
			else structureIssues.push({ ...t, message: `Unexpected '${t.text}'.` });
		}
	}
	for (const t of brackets) structureIssues.push({ ...t, message: `Unclosed '${t.text}'.` });
	// Includes and conditional branches can supply matching delimiters. Until
	// preprocessing is evaluated, reporting these as errors would be misleading.
	if (!preprocessed) issues.push(...structureIssues);
	return { tokens, blocks, definitions, includes, issues };
}

export const menuScopeAt = (model: MenuModel, offset: number): MenuScope =>
	model.blocks
		.filter((b) => b.bodyStart <= offset && (offset < b.end || (!b.closed && offset === b.end)))
		.at(-1)?.scope ?? "global";
