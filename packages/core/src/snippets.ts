/** A snippet in LSP/TextMate snippet syntax, offered as a completion item. */
export type Snippet = {
	prefix: string;
	body: string;
	description: string;
};

export const createSnippets = (keywords: readonly string[]): Snippet[] => {
	const snippets: Snippet[] = [];
	const lines = (...lines: string[]) => lines.join("\n");

	if (keywords.includes("if")) {
		snippets.push({
			prefix: "if",
			body: lines("if (${1:condition})", "{", "\t$0", "}"),
			description: "If Statement",
		});

		if (keywords.includes("else")) {
			snippets.push({
				prefix: "ifelse",
				body: lines("if (${1:condition})", "{", "\t$0", "}", "else", "{", "\t", "}"),
				description: "If-Else Statement",
			});
		}
	}

	if (keywords.includes("switch")) {
		snippets.push({
			prefix: "switch",
			body: lines(
				"switch (${1:variable})",
				"{",
				"\tcase ${2:value}:",
				"\t\t$0",
				"\t\tbreak;",
				"",
				"\tdefault:",
				"\t\tbreak;",
				"}",
			),
			description: "Switch Statement",
		});
	}

	if (keywords.includes("while")) {
		snippets.push({
			prefix: "while",
			body: lines("while (${1:condition})", "{", "\t$0", "}"),
			description: "While Loop",
		});
	}

	if (keywords.includes("for")) {
		snippets.push({
			prefix: "for",
			body: lines("for (${1:i} = ${2:0}; ${1:i} < $3; ${1:i}++)", "{", "\t$0", "}"),
			description: "For Loop",
		});
	}

	if (keywords.includes("foreach")) {
		snippets.push({
			prefix: "foreach",
			body: lines("foreach (${1:element} in ${2:array})", "{", "\t$0", "}"),
			description: "For-Each Loop",
		});
	}

	snippets.push({
		prefix: "function",
		body: lines("${1:function}($2)", "{", "\t$0", "}"),
		description: "Function",
	});

	snippets.push({
		prefix: "include",
		body: "#include $0;",
		description: "Include",
	});

	snippets.push({
		prefix: "animtree",
		body: '#using_animtree("$0");',
		description: "Animation Tree",
	});

	snippets.push({
		prefix: "color",
		body: "(${1:red}/255, ${2:green}/255, ${3:blue}/255)",
		description: "Color vector",
	});

	return snippets;
};
