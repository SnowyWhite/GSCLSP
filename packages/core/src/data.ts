import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Engine } from "./models/Engine";

export const readJSON = async (path: string) => JSON.parse(await readFile(path, "utf-8"));

/** Reads every `<dataDir>/<engine>/engine.json` written by the data build. */
export const loadEngines = async (dataDir: string): Promise<Engine[]> => {
	const entries = await readdir(dataDir, { withFileTypes: true });
	const engineIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	return Promise.all(engineIds.map((id) => readJSON(join(dataDir, id, "engine.json"))));
};
