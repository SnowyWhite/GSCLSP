import {
	type Engine,
	SETTINGS_SECTION,
	type Settings,
	resolveSettings,
} from "@gsc-language-server/core";
import type { ClientCapabilities, Connection } from "vscode-languageserver";

/** Accepts both `{ "GSC": { ... } }` and the bare section contents. */
const getSection = (value: unknown) => {
	if (typeof value !== "object" || value === null) return undefined;
	return SETTINGS_SECTION in value ? (value as Record<string, unknown>)[SETTINGS_SECTION] : value;
};

/**
 * Settings come from, in increasing precedence:
 * 1. defaults (from engine data)
 * 2. `initializationOptions`
 * 3. the client configuration: pulled via `workspace/configuration` if supported, otherwise the
 *    settings pushed with `workspace/didChangeConfiguration`
 */
export class Configuration {
	private readonly connection: Connection;
	private readonly engines: readonly Engine[];
	private readonly initializationOptions: unknown;
	readonly supportsPull: boolean;
	private clientSettings: unknown;

	constructor(
		connection: Connection,
		engines: readonly Engine[],
		capabilities: ClientCapabilities,
		initializationOptions: unknown,
	) {
		this.connection = connection;
		this.engines = engines;
		this.initializationOptions = getSection(initializationOptions);
		this.supportsPull = capabilities.workspace?.configuration ?? false;
	}

	get settings(): Settings {
		return resolveSettings(this.engines, this.initializationOptions, this.clientSettings);
	}

	/** Updates the client settings from a `didChangeConfiguration` payload, or by pulling them. */
	async refresh(pushedSettings?: unknown) {
		if (this.supportsPull) {
			this.clientSettings = await this.connection.workspace.getConfiguration({
				section: SETTINGS_SECTION,
			});
		} else {
			this.clientSettings = getSection(pushedSettings) ?? this.clientSettings;
		}
		return this.settings;
	}
}
