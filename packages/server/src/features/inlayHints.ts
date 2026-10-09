import { rangeContains, rangesIntersect } from "@gsclsp/core";
import {
	type CancellationToken,
	type InlayHint,
	InlayHintKind,
	type InlayHintParams,
} from "vscode-languageserver";

import type { DocumentContext, Server } from "../context";
import { getCallableContext } from "./shared";

export const provideInlayHints = async (
	server: Server,
	{ engine, file }: DocumentContext,
	{ range }: InlayHintParams,
	token: CancellationToken,
): Promise<InlayHint[]> => {
	const result: InlayHint[] = [];
	const { usages, getDef } = await getCallableContext(server.stores, file, engine);
	if (token.isCancellationRequested) return result;

	for (const { value: usage } of usages) {
		if (usage.kind !== "call") continue;
		if (!rangesIntersect(range, usage.paramList.range)) continue;
		const def = getDef(usage);
		if (!def?.params) continue;

		for (let i = 0; i < usage.params.length; i++) {
			if (!def.params[i]) break;
			const contentRange = usage.params.getByIndex(i)!.value.contentRange;
			if (!contentRange || !rangeContains(range, contentRange.start)) continue;
			result.push({
				position: contentRange.start,
				label: `${def.params[i].name}:`,
				kind: InlayHintKind.Parameter,
				paddingRight: true,
			});
		}
	}

	return result;
};
