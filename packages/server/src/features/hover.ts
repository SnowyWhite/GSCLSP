import { getWordRangeAtPosition, isRangeEqual } from "@gsc-language-server/core";
import {
	type CancellationToken,
	type Hover,
	type HoverParams,
	MarkupKind,
} from "vscode-languageserver";

import type { DocumentContext, Server } from "../context";
import { createDocumentation, createUsage, getCallableContext } from "./shared";

export const provideHover = async (
	server: Server,
	{ document, engine, file, settings }: DocumentContext,
	{ position }: HoverParams,
	token: CancellationToken,
): Promise<Hover | undefined> => {
	const wordRange = getWordRangeAtPosition(document, position, /[A-Za-z_][\w]*/);
	if (!wordRange) return;

	const { usages, getDef } = await getCallableContext(server.stores, file, engine);
	if (token.isCancellationRequested) return;
	const usage = usages
		.getAt(wordRange.start)
		.find(({ value }) => isRangeEqual(value.name.range, wordRange))?.value;
	const def = usage && getDef(usage);
	if (!def) return;

	const documentation = createDocumentation(def, engine.languageId, {
		concise: settings.intelliSense.conciseMode,
		example: false,
	});
	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: `\`\`\`txt\n${createUsage(def)}\n\`\`\`\n\n${documentation.value}`,
		},
		range: wordRange,
	};
};
