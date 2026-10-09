import { type Range, getWordRangeAtPosition, isRangeEqual } from "@gsclsp/core";
import type {
	CancellationToken,
	DefinitionParams,
	Location,
	LocationLink,
} from "vscode-languageserver";

import type { DocumentContext, Server } from "../context";

const nullRange: Range = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

export const provideDefinition = async (
	server: Server,
	{ document, engine, file }: DocumentContext,
	{ position }: DefinitionParams,
	token: CancellationToken,
): Promise<LocationLink[] | Location[] | undefined> => {
	const filesystem = await server.stores.gsc.getFilesystem(engine.id);
	if (token.isCancellationRequested) return;
	const script = filesystem.getScriptByFile(file);
	if (!script) return;

	const wordRange = getWordRangeAtPosition(document, position, /[\w\\]+/);
	if (!wordRange) return;

	const getIncludeLink = async (): Promise<LocationLink | undefined> => {
		const includes = await file.getIncludes();
		if (token.isCancellationRequested) return;
		const include = includes.byRange.getAt(position)?.value;
		if (!include || !isRangeEqual(include.path.range, wordRange)) return;

		const includedScripts = await script.getIncludedScripts();
		if (token.isCancellationRequested) return;
		const includedScript = includedScripts.get(include.path.text);
		if (!includedScript) return;

		return {
			targetUri: server.toClientUri(includedScript.file),
			targetRange: nullRange,
			targetSelectionRange: nullRange,
			originSelectionRange: wordRange,
		};
	};

	const getCallableLink = async (): Promise<LocationLink | undefined> => {
		const usages = await file.getCallableUsages();
		if (token.isCancellationRequested) return;
		const defs = await script.getCallableUsageDefs();
		if (token.isCancellationRequested) return;

		const usage = usages.getAt(position).at(-1)?.value;
		if (!usage) return;
		const def = defs.get(usage);
		if (!def || def.origin !== "script") return;

		const isName = isRangeEqual(usage.name.range, wordRange);
		if (!(isName || (usage.path && isRangeEqual(usage.path.range, wordRange)))) return;

		const targetRange = isName ? def.name.range : nullRange;
		return {
			targetUri: server.toClientUri(def.file),
			targetRange,
			targetSelectionRange: targetRange,
			originSelectionRange: wordRange,
		};
	};

	const link = (await getIncludeLink()) ?? (await getCallableLink());
	if (!link) return;
	if (server.capabilities.textDocument?.definition?.linkSupport) return [link];
	return [{ uri: link.targetUri, range: link.targetSelectionRange }];
};
