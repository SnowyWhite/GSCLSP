import { join } from "node:path";
import { readJSON } from "../../../data";

import type { Settings } from "../../../settings";
import { type Snippet, createSnippets } from "../../../snippets";
import type { Engine } from "../../Engine";

import type { CallableDefGame } from "../../Callable";
import { CallableDefsGameRepo } from "./CallableDefsGameRepo";
import { KeywordsRepo } from "./KeywordsRepo";

export class StaticStore {
	private readonly dataDir: string;
	private readonly getSettings: () => Settings;

	private readonly keywords: KeywordsRepo;
	private readonly keywordsByEngine: Map<Engine["id"], string[]>;
	private readonly snippetsByEngine: Map<Engine["id"], Snippet[]>;
	private readonly callableDefsGame: CallableDefsGameRepo;
	private readonly callableDefsGameByEngine: Map<
		Engine["id"],
		ReadonlyMap<string, CallableDefGame>
	>;

	constructor(dataDir: string, getSettings: () => Settings) {
		this.dataDir = dataDir;
		this.getSettings = getSettings;

		this.keywords = new KeywordsRepo();
		this.keywordsByEngine = new Map();
		this.snippetsByEngine = new Map();
		this.callableDefsGame = new CallableDefsGameRepo();
		this.callableDefsGameByEngine = new Map();
	}

	async init() {
		const [keywords, callables] = await Promise.all([
			readJSON(join(this.dataDir, "keywords.json")),
			readJSON(join(this.dataDir, "callables.json")),
		]);
		this.keywords.addRaw(keywords);
		this.callableDefsGame.addRaw(callables);
	}

	getKeywords(engineId: Engine["id"]) {
		let keywords = this.keywordsByEngine.get(engineId);
		if (!keywords) {
			keywords = this.keywords.createScoped({ engine: engineId });
			this.keywordsByEngine.set(engineId, keywords);
		}
		return keywords;
	}

	getSnippets(engineId: Engine["id"]) {
		let snippets = this.snippetsByEngine.get(engineId);
		if (!snippets) {
			snippets = createSnippets(this.getKeywords(engineId));
			this.snippetsByEngine.set(engineId, snippets);
		}
		return snippets;
	}

	/** Engine callables of the featuresets enabled in the settings, keyed by lowercase name. */
	getCallableDefs(engineId: Engine["id"]) {
		let callables = this.callableDefsGameByEngine.get(engineId);
		if (!callables) {
			const featuresetFlags = this.getSettings().featureSets[engineId] ?? {};
			const featuresetList = Object.keys(featuresetFlags).filter((key) => featuresetFlags[key]);
			callables = this.callableDefsGame.createScoped({
				engine: engineId,
				featuresets: featuresetList,
			});
			this.callableDefsGameByEngine.set(engineId, callables);
		}
		return callables;
	}

	onSettingsChanged(previous: Settings, current: Settings) {
		if (JSON.stringify(previous.featureSets) !== JSON.stringify(current.featureSets)) {
			this.callableDefsGameByEngine.clear();
		}
	}
}
