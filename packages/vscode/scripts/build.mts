import { execFileSync } from "node:child_process";
import { cp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { SETTINGS_SECTION, createSettingsSchema, loadEngines } from "@gsc-language-server/core";
import { build } from "esbuild";

/**
 * Assembles the extension in dist/: the bundled client, the language server with its data, the
 * TextMate grammar and the manifest with settings generated from the server's settings schema.
 * `--package` also writes gsc-language-server-vscode-<version>.vsix.
 * Requires a built server (`npm run build -w packages/server`).
 */

const args = parseArgs({ options: { package: { type: "boolean", default: false } } }).values;

const packageDir = join(import.meta.dirname, "..");
const repositoryDir = join(packageDir, "..", "..");
const serverDistDir = join(packageDir, "..", "server", "dist");
const distDir = join(packageDir, "dist");

await stat(join(serverDistDir, "server.js")).catch(() => {
	throw new Error(`Missing ${serverDistDir}. Run "npm run build -w packages/server" first.`);
});

await rm(distDir, { recursive: true, force: true });

await build({
	entryPoints: [join(packageDir, "src", "extension.ts")],
	outfile: join(distDir, "extension.js"),
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node20",
	external: ["vscode"],
	logLevel: "warning",
});

await cp(join(serverDistDir, "server.js"), join(distDir, "server.js"));
await cp(join(serverDistDir, "data"), join(distDir, "data"), { recursive: true });
await cp(
	join(packageDir, "language-configuration.json"),
	join(distDir, "language-configuration.json"),
);
await cp(join(packageDir, "README.md"), join(distDir, "README.md"));
await cp(join(repositoryDir, "LICENSE"), join(distDir, "LICENSE"));

type Schema = { type?: string; properties?: Record<string, Schema>; [key: string]: unknown };

/** VS Code settings are flat dotted keys: one per leaf of the server's settings schema. */
const toConfigurationProperties = (schema: Schema, prefix: string): Record<string, unknown> => {
	if (schema.type !== "object" || !schema.properties) {
		const { description, ...rest } = schema;
		return { [prefix]: { ...rest, markdownDescription: description, scope: "window" } };
	}
	return Object.assign(
		{},
		...Object.entries(schema.properties).map(([key, child]) =>
			toConfigurationProperties(child, `${prefix}.${key}`),
		),
	);
};

const engines = await loadEngines(join(distDir, "data"));
const schema = createSettingsSchema(engines).properties[SETTINGS_SECTION] as Schema;
const {
	scripts,
	devDependencies,
	private: _,
	...manifest
} = JSON.parse(await readFile(join(packageDir, "package.json"), "utf-8"));

await writeFile(
	join(distDir, "package.json"),
	JSON.stringify({
		...manifest,
		main: "./extension.js",
		contributes: {
			languages: [
				{
					id: "gsc",
					aliases: ["GSC", "Game Script"],
					extensions: [".gsc", ".csc"],
					configuration: "./language-configuration.json",
				},
			],
			grammars: [{ language: "gsc", scopeName: "source.gsc", path: "./data/grammar.json" }],
			configuration: {
				title: "GSC",
				properties: toConfigurationProperties(schema, SETTINGS_SECTION),
			},
			// Game scripts are Windows-1252 encoded.
			configurationDefaults: { "[gsc]": { "files.encoding": "windows1252" } },
		},
	}),
);
console.log("Built extension in dist/.");

if (args.package) {
	const vsce = join(repositoryDir, "node_modules", "@vscode", "vsce", "vsce");
	const output = join(packageDir, `gsc-language-server-vscode-${manifest.version}.vsix`);
	execFileSync(
		process.execPath,
		[vsce, "package", "--no-dependencies", "--allow-missing-repository", "--out", output],
		{ cwd: distDir, stdio: "inherit" },
	);
}
