import type { Range } from "@gsclsp/core";
import {
	type CancellationToken,
	type SemanticTokens,
	SemanticTokensBuilder,
	type SemanticTokensLegend,
} from "vscode-languageserver";

import type { DocumentContext, Server } from "../context";
import { getCallableContext } from "./shared";

export const semanticTokensLegend: SemanticTokensLegend = {
	tokenTypes: [
		"function",
		"method",
		"parameter",
		"keyword",
		"string",
		"number",
		"comment",
		"macro",
	],
	tokenModifiers: ["definition", "defaultLibrary", "deprecated"],
};

const tokenType = { function: 0, method: 1, parameter: 2 };
const tokenModifier = { definition: 0b001, defaultLibrary: 0b010, deprecated: 0b100 };

/** Tokens of the whole document, or of `range` only. */
export const provideSemanticTokens = async (
	server: Server,
	{ document, engine, file }: DocumentContext,
	token: CancellationToken,
	range?: Range,
): Promise<SemanticTokens> => {
	// The builder sorts tokens, so definitions and usages can be pushed in any order.
	const builder = new SemanticTokensBuilder();
	const getLength = (range: Range) => document.offsetAt(range.end) - document.offsetAt(range.start);

	const defs = await file.getCallableDefs();
	if (token.isCancellationRequested) return builder.build();
	const { usages, getDef } = await getCallableContext(server.stores, file, engine);
	if (token.isCancellationRequested) return builder.build();

	const defsIterable = range ? defs.byRange.getIn(range, true) : defs.byRange;
	for (const { value: def } of defsIterable) {
		const { name, params, body } = def;
		const { line, character } = name.range.start;
		builder.push(line, character, name.text.length, tokenType.function, tokenModifier.definition);
		for (const { range } of params) {
			const { line, character } = range.start;
			builder.push(
				line,
				character,
				getLength(range),
				tokenType.parameter,
				tokenModifier.definition,
			);
		}
		for (const { range } of body.variables.params) {
			const { line, character } = range.start;
			builder.push(line, character, getLength(range), tokenType.parameter, 0);
		}
	}

	const usagesIterable = range ? usages.getIn(range) : usages;
	for (const { value: usage } of usagesIterable) {
		const def = getDef(usage);
		if (def?.origin !== "game") continue;
		const { line, character } = usage.name.range.start;
		const type = def.receiver ? tokenType.method : tokenType.function;
		const modifiers = def.deprecated
			? tokenModifier.defaultLibrary | tokenModifier.deprecated
			: tokenModifier.defaultLibrary;
		builder.push(line, character, usage.name.text.length, type, modifiers);
	}

	return builder.build();
};
