import { parseArgs } from "node:util";
import { getJSON, removeDir, writeJSON } from "./io";

import type { Engine, EngineScope } from "@gsc-language-server/core";

import createGrammar from "./templates/grammar";

/**
 * Fetches documentation from a gsc-doc API and writes the editor-agnostic data directory:
 *
 * data/keywords.json, data/callables.json  (read by the language server)
 * data/<engine>/engine.json                (read by the language server)
 * data/<engine>/grammar.json               (per-engine TextMate grammar, used by VS Code)
 * data/grammar.json                        (TextMate grammar for clients without per-engine languages)
 */

const args = parseArgs({
	options: {
		api: {
			type: "string",
		},
		engine: {
			type: "string",
			default: [],
			multiple: true,
		},
		out: {
			type: "string",
			default: "data",
		},
	},
	args: process.argv.slice(2),
}).values;
if (!args.api) throw new Error("Missing required --api argument.");

const apiUrl = new URL(args.api);

const index = await getJSON(new URL("./index.json", apiUrl));
const urls: { engines: string; keywords: string; callables: string } = index.urls;

const enginesDocs: {
	id: string;
	displayName: string;
	gameTitle: string;
	featuresets: { id: string; displayName: string; description: string }[];
}[] = await getJSON(urls.engines);
const enginesDocsById = new Map(enginesDocs.map((engine) => [engine.id, engine]));

const engines: Engine[] = args.engine.map((id) => {
	const docs = enginesDocsById.get(id);
	if (!docs) throw new Error(`Engine '${id}' is not documented in ${urls.engines}.`);

	return {
		id,
		languageId: `gsc-${id}`,
		displayName: docs.displayName,
		gameTitle: docs.gameTitle,
		featuresets: docs.featuresets.map(({ id, displayName, description }) => ({
			id,
			displayName,
			description,
			enabledByDefault: ["common", "mp"].includes(id),
		})),
	};
});

const keywords = await getJSON(urls.keywords);
const keywordsByEngineId = (() => {
	const result = new Map<string, string[]>();
	for (const name in keywords) {
		const scopes: EngineScope[] = keywords[name].scopes;
		for (const scope of scopes) {
			let engineKeywords = result.get(scope.engine);
			if (!engineKeywords) {
				engineKeywords = [];
				result.set(scope.engine, engineKeywords);
			}
			engineKeywords.push(name);
		}
	}
	return result;
})();

const callables = await getJSON(urls.callables);

const projectDir = new URL("../", import.meta.url);
const outDataDir = new URL(`${args.out.replace(/[\\/]*$/, "")}/`, projectDir);

if (await removeDir(outDataDir)) console.log("Removed data directory.");

const writePromises: Promise<void>[] = [];
writePromises.push(writeJSON(new URL("keywords.json", outDataDir), keywords));
writePromises.push(writeJSON(new URL("callables.json", outDataDir), callables));

const allKeywords = new Set<string>();
for (const engine of engines) {
	const outEngineDir = new URL(`${engine.id}/`, outDataDir);
	const engineKeywords = keywordsByEngineId.get(engine.id) ?? [];
	for (const keyword of engineKeywords) allKeywords.add(keyword);

	writePromises.push(writeJSON(new URL("engine.json", outEngineDir), engine));
	const grammar = createGrammar(
		{ name: `Game Script (${engine.displayName})`, scopeName: `source.gsc.${engine.id}` },
		engineKeywords,
	);
	writePromises.push(writeJSON(new URL("grammar.json", outEngineDir), grammar));
}

const grammar = createGrammar({ name: "Game Script", scopeName: "source.gsc" }, [...allKeywords]);
writePromises.push(writeJSON(new URL("grammar.json", outDataDir), grammar));

await Promise.all(writePromises);
console.log(`Data written to ${outDataDir.pathname}`);
