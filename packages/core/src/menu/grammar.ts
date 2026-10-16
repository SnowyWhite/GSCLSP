import { menuCatalog } from "./catalog";

const words = (scope: string) =>
	[
		...new Set(
			menuCatalog.filter((e) => e.scope === scope && /^\w+$/.test(e.name)).map((e) => e.name),
		),
	].join("|");

/** Shared by the VS Code extension and the JetBrains TextMate bundle. */
export const menuGrammar = {
	name: "Call of Duty Menu",
	scopeName: "source.menu",
	fileTypes: ["menu"],
	patterns: [
		{ name: "comment.line.double-slash.menu", begin: "//", end: "$" },
		{ name: "comment.block.menu", begin: "/\\*", end: "\\*/" },
		{
			name: "string.quoted.double.menu",
			begin: '"',
			end: '"',
			patterns: [{ name: "constant.character.escape.menu", match: "\\\\." }],
		},
		{
			name: "meta.preprocessor.menu",
			match: "^\\s*#\\s*(?:include|define|undef|if|ifdef|ifndef|elif|else|endif)\\b",
		},
		{ name: "support.function.menu", match: `(?i)\\b(?:${words("expression")})\\b(?=\\s*\\()` },
		{
			name: "keyword.control.menu",
			match: `(?i)\\b(?:${["global", "menu", "item", "function", "event"].map(words).join("|")})\\b`,
		},
		{
			name: "constant.numeric.menu",
			match: "\\b0[xX][0-9a-fA-F]+\\b|(?<![\\w.])(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?",
		},
	],
};
