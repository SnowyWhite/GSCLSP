import { resolve } from "node:path";

import type { OpenDocuments } from "./gsc/GscFile";
import { GscStore } from "./gsc/GscStore";
import { StaticStore } from "./static/StaticStore";

import type { Settings } from "../../settings";
import { getRelativePathSegments, uriToFsPath } from "../../uri";
import type { Engine } from "../Engine";

export type StoresOptions = {
	engines: readonly Engine[];
	dataDir: string;
	settings: Settings;
	openDocuments: OpenDocuments;
	warn: (message: string) => void;
};

export class Stores {
	readonly engines: readonly Engine[];
	readonly static: StaticStore;
	readonly gsc: GscStore;
	private currentSettings: Settings;

	constructor(options: StoresOptions) {
		if (options.engines.length === 0) throw new Error("No engines available.");
		this.engines = options.engines;
		this.currentSettings = options.settings;
		const getSettings = () => this.currentSettings;
		this.static = new StaticStore(options.dataDir, getSettings);
		this.gsc = new GscStore({
			engines: options.engines,
			getSettings,
			openDocuments: options.openDocuments,
			warn: options.warn,
		});
	}

	async init() {
		await this.static.init();
	}

	get settings() {
		return this.currentSettings;
	}

	set settings(settings: Settings) {
		const previous = this.currentSettings;
		this.currentSettings = settings;
		this.static.onSettingsChanged(previous, settings);
		this.gsc.onSettingsChanged(previous, settings);
	}

	/**
	 * Engine of a document, in order of precedence:
	 * 1. the engine whose root directory contains the file (the innermost one)
	 * 2. an engine-specific language ID (`gsc-iw3`) sent by clients with one language per engine.
	 *    VS Code assigns one of these to every GSC file, so it can't take precedence over 1.
	 * 3. the `defaultEngine` setting
	 */
	resolveEngine(uri: string, languageId?: string): Engine {
		const fsPath = uriToFsPath(uri);
		if (fsPath) {
			let match: { engine: Engine; rootLength: number } | undefined;
			for (const engine of this.engines) {
				for (const root of this.settings.rootDirectories[engine.id] ?? []) {
					const absoluteRoot = resolve(root);
					if (!getRelativePathSegments(absoluteRoot, fsPath)) continue;
					const rootLength = absoluteRoot.length;
					if (!match || rootLength > match.rootLength) match = { engine, rootLength };
				}
			}
			if (match) return match.engine;
		}

		const byLanguageId = this.engines.find((engine) => engine.languageId === languageId);
		if (byLanguageId) return byLanguageId;

		return (
			this.engines.find((engine) => engine.id === this.settings.defaultEngine) ?? this.engines[0]
		);
	}
}
