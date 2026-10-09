import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { type Engine, Stores, fsPathToUri, normalizeUri, resolveSettings } from "../src";

const engine = (id: string): Engine => ({
	id,
	languageId: `gsc-${id}`,
	displayName: id.toUpperCase(),
	gameTitle: id,
	featuresets: [
		{ id: "mp", displayName: "MP", description: "", enabledByDefault: true },
		{ id: "sp", displayName: "SP", description: "", enabledByDefault: false },
	],
});
const engines = [engine("iw3"), engine("iw4")];

describe("resolveSettings", () => {
	it("applies later sources over earlier ones and ignores invalid values", () => {
		const settings = resolveSettings(
			engines,
			{ colors: { enable: "all" }, featureSets: { iw3: { sp: true } }, defaultEngine: "iw4" },
			{
				colors: { enable: "rainbow" },
				featureSets: { iw3: { mp: false, unknown: true } },
				rootDirectories: { iw4: ["C:\\iw4", 5, ""] },
				defaultEngine: "iw9",
			},
		);
		assert.equal(settings.colors.enable, "all");
		assert.deepEqual(settings.featureSets.iw3, { mp: false, sp: true });
		assert.deepEqual(settings.featureSets.iw4, { mp: true, sp: false });
		assert.deepEqual(settings.rootDirectories, { iw3: [], iw4: ["C:\\iw4"] });
		assert.equal(settings.defaultEngine, "iw4");
	});
});

describe("Stores.resolveEngine", () => {
	const root = join(import.meta.dirname, "fixtures");
	const stores = new Stores({
		engines,
		dataDir: root,
		settings: resolveSettings(engines, {
			rootDirectories: { iw3: [root], iw4: [join(root, "iw4")] },
			defaultEngine: "iw4",
		}),
		openDocuments: { get: () => undefined },
		warn: () => {},
	});
	const resolve = (path: string, languageId?: string) =>
		stores.resolveEngine(fsPathToUri(join(root, path)), languageId).id;

	it("uses the innermost root directory containing the file, over the language ID", () => {
		assert.equal(resolve("a.gsc", "gsc"), "iw3");
		assert.equal(resolve("iw4/a.gsc"), "iw4");
		assert.equal(resolve("iw4/a.gsc", "gsc-iw3"), "iw4");
	});

	it("uses an engine-specific language ID outside of root directories", () => {
		assert.equal(stores.resolveEngine("file:///elsewhere/a.gsc", "gsc-iw3").id, "iw3");
	});

	it("falls back to the default engine", () => {
		assert.equal(stores.resolveEngine("file:///elsewhere/a.gsc", "gsc").id, "iw4");
		assert.equal(stores.resolveEngine("untitled:Untitled-1").id, "iw4");
	});
});

describe("normalizeUri", () => {
	it("maps differently encoded URIs of the same file to one key", () => {
		if (process.platform === "win32") {
			assert.equal(normalizeUri("file:///D:/a%20b/x.gsc"), normalizeUri("file:///d%3A/a b/x.gsc"));
			assert.equal(normalizeUri("file:///D:/x.gsc"), fsPathToUri("D:\\x.gsc"));
		} else {
			assert.equal(normalizeUri("file:///a%20b/x.gsc"), normalizeUri("file:///a b/x.gsc"));
		}
		assert.equal(normalizeUri("untitled:Untitled-1"), "untitled:Untitled-1");
	});
});
