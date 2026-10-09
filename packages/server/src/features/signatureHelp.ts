import type { CallableDef } from "@gsc-language-server/core";
import {
	type CancellationToken,
	MarkupKind,
	type SignatureHelp,
	type SignatureHelpParams,
	type SignatureInformation,
} from "vscode-languageserver";

import type { DocumentContext, Server } from "../context";
import { createParamsUsage, getCallableContext } from "./shared";

export const provideSignatureHelp = async (
	server: Server,
	{ engine, file }: DocumentContext,
	{ position }: SignatureHelpParams,
	token: CancellationToken,
): Promise<SignatureHelp | undefined> => {
	const { usages, getDef } = await getCallableContext(server.stores, file, engine);
	if (token.isCancellationRequested) return;

	const usagesAtPos = usages.getAt(position);
	for (let i = usagesAtPos.length - 1; i >= 0; i--) {
		const usage = usagesAtPos[i].value;
		if (usage.kind !== "call") continue;

		let activeParameterIndex = usage.params.indexAt(position, true);
		if (activeParameterIndex === -1) continue; // not inside parameter list

		const def = getDef(usage);
		if (!def?.params) return;

		if (def.paramsRepeatable === "last" && activeParameterIndex >= def.params.length) {
			activeParameterIndex = def.params.length - 1;
		} else if (def.paramsRepeatable === "all" && def.params.length > 0) {
			activeParameterIndex %= def.params.length;
		}

		return {
			signatures: [createSignature(def, def.params)],
			activeSignature: 0,
			activeParameter: activeParameterIndex,
		};
	}
};

const createSignature = (
	def: CallableDef,
	params: NonNullable<CallableDef["params"]>,
): SignatureInformation => {
	const parameters = createParamsUsage(def).map((usage, i) => ({
		label: usage,
		documentation: params[i]?.description
			? { kind: MarkupKind.Markdown, value: params[i].description.join("\n") }
			: undefined,
	}));
	return {
		label: `${def.name.text}(${parameters.map(({ label }) => label).join(", ")})`,
		parameters,
	};
};
