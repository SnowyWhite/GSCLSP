import type { Engine } from "./models/Engine";

/**
 * Settings under the `GSC` configuration section. Per-engine settings are keyed by engine id
 * (e.g. `GSC.rootDirectories.iw3`).
 */
export type Settings = {
	intelliSense: {
		enable: {
			keywords: boolean;
			callablesGame: "off" | "non-deprecated" | "all";
			callablesScript: boolean;
		};
		conciseMode: boolean;
		foldersSorting: "top" | "bottom" | "inline";
	};
	colors: {
		enable: "off" | "quotients" | "all";
	};
	/** Enabled featuresets per engine id. */
	featureSets: { [engineId: string]: { [featureset: string]: boolean } };
	/** Script root directories per engine id. Later directories take precedence. */
	rootDirectories: { [engineId: string]: string[] };
	/** Engine for documents that are neither in a root directory nor opened with an engine language ID. */
	defaultEngine: string;
};

export const SETTINGS_SECTION = "GSC";

export const createDefaultSettings = (engines: readonly Engine[]): Settings => ({
	intelliSense: {
		enable: {
			keywords: true,
			callablesGame: "non-deprecated",
			callablesScript: true,
		},
		conciseMode: false,
		foldersSorting: "inline",
	},
	colors: {
		enable: "quotients",
	},
	featureSets: Object.fromEntries(
		engines.map((engine) => [
			engine.id,
			Object.fromEntries(engine.featuresets.map((f) => [f.id, f.enabledByDefault])),
		]),
	),
	rootDirectories: Object.fromEntries(engines.map((engine) => [engine.id, []])),
	defaultEngine: engines[0]?.id ?? "",
});

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const pick = <T>(value: unknown, fallback: T, isValid: (value: unknown) => boolean): T =>
	isValid(value) ? (value as T) : fallback;

const isBoolean = (value: unknown) => typeof value === "boolean";
const isOneOf = (options: readonly string[]) => (value: unknown) =>
	typeof value === "string" && options.includes(value);

/**
 * Applies untrusted settings objects (client configuration, initialization options) on top of the
 * defaults. Later sources take precedence. Invalid values are ignored.
 */
export const resolveSettings = (engines: readonly Engine[], ...sources: unknown[]): Settings => {
	const result = createDefaultSettings(engines);

	for (const source of sources) {
		if (!isObject(source)) continue;
		const intelliSense = isObject(source.intelliSense) ? source.intelliSense : {};
		const enable = isObject(intelliSense.enable) ? intelliSense.enable : {};
		const colors = isObject(source.colors) ? source.colors : {};
		const current = result.intelliSense;

		current.enable.keywords = pick(enable.keywords, current.enable.keywords, isBoolean);
		current.enable.callablesGame = pick(
			enable.callablesGame,
			current.enable.callablesGame,
			isOneOf(["off", "non-deprecated", "all"]),
		);
		current.enable.callablesScript = pick(
			enable.callablesScript,
			current.enable.callablesScript,
			isBoolean,
		);
		current.conciseMode = pick(intelliSense.conciseMode, current.conciseMode, isBoolean);
		current.foldersSorting = pick(
			intelliSense.foldersSorting,
			current.foldersSorting,
			isOneOf(["top", "bottom", "inline"]),
		);
		result.colors.enable = pick(
			colors.enable,
			result.colors.enable,
			isOneOf(["off", "quotients", "all"]),
		);

		const engineIds = engines.map((engine) => engine.id);
		result.defaultEngine = pick(source.defaultEngine, result.defaultEngine, isOneOf(engineIds));

		for (const engine of engines) {
			const featureSets = isObject(source.featureSets) ? source.featureSets[engine.id] : undefined;
			if (isObject(featureSets)) {
				const engineFeatureSets = result.featureSets[engine.id];
				for (const { id } of engine.featuresets) {
					engineFeatureSets[id] = pick(featureSets[id], engineFeatureSets[id], isBoolean);
				}
			}

			const rootDirectories = isObject(source.rootDirectories)
				? source.rootDirectories[engine.id]
				: undefined;
			if (Array.isArray(rootDirectories)) {
				result.rootDirectories[engine.id] = rootDirectories.filter(
					(path): path is string => typeof path === "string" && path.length > 0,
				);
			}
		}
	}

	return result;
};

/** JSON Schema of `{ "GSC": Settings }`, for editors of the settings JSON (e.g. LSP4IJ). */
export const createSettingsSchema = (engines: readonly Engine[]) => {
	const defaults = createDefaultSettings(engines);
	const perEngine = (createSchema: (engine: Engine) => object) => ({
		type: "object",
		properties: Object.fromEntries(engines.map((engine) => [engine.id, createSchema(engine)])),
		additionalProperties: false,
	});
	const enumSetting = (description: string, values: string[], fallback: string) => ({
		description,
		type: "string",
		enum: values,
		default: fallback,
	});
	const { intelliSense } = defaults;

	return {
		$schema: "http://json-schema.org/draft-07/schema#",
		type: "object",
		properties: {
			[SETTINGS_SECTION]: {
				type: "object",
				additionalProperties: false,
				properties: {
					rootDirectories: {
						description:
							"Root directories with stock or custom scripts per engine. Later directories take precedence. Without any, the default engine uses the project folders.",
						...perEngine((engine) => ({
							description: engine.gameTitle,
							type: "array",
							items: { type: "string" },
							default: [],
						})),
					},
					featureSets: {
						description: "Engine feature sets used for completion and semantic highlighting.",
						...perEngine((engine) => ({
							description: engine.gameTitle,
							type: "object",
							additionalProperties: false,
							properties: Object.fromEntries(
								engine.featuresets.map((featureset) => [
									featureset.id,
									{
										description: featureset.description,
										type: "boolean",
										default: featureset.enabledByDefault,
									},
								]),
							),
						})),
					},
					defaultEngine: enumSetting(
						"Engine of files outside of all root directories.",
						engines.map((engine) => engine.id),
						defaults.defaultEngine,
					),
					intelliSense: {
						type: "object",
						additionalProperties: false,
						properties: {
							enable: {
								type: "object",
								additionalProperties: false,
								properties: {
									keywords: {
										description: "Suggest keywords (if, for, switch, ...).",
										type: "boolean",
										default: intelliSense.enable.keywords,
									},
									callablesGame: enumSetting(
										"Suggest inbuilt (engine) functions and methods.",
										["off", "non-deprecated", "all"],
										intelliSense.enable.callablesGame,
									),
									callablesScript: {
										description: "Suggest script-defined functions and methods.",
										type: "boolean",
										default: intelliSense.enable.callablesScript,
									},
								},
							},
							conciseMode: {
								description: "Make documentation entries more concise.",
								type: "boolean",
								default: intelliSense.conciseMode,
							},
							foldersSorting: enumSetting(
								"Sorting of folders when suggesting script paths.",
								["top", "bottom", "inline"],
								intelliSense.foldersSorting,
							),
						},
					},
					colors: {
						type: "object",
						additionalProperties: false,
						properties: {
							enable: enumSetting(
								"Show a color picker on vectors: never, only when all components are quotients (e.g. 255/255), or always.",
								["off", "quotients", "all"],
								defaults.colors.enable,
							),
						},
					},
				},
			},
		},
	};
};
