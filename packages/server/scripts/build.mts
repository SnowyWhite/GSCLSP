import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
	SETTINGS_SECTION,
	createDefaultSettings,
	createSettingsSchema,
	loadEngines,
} from "@gsc-language-server/core";
import { build } from "esbuild";

/**
 * dist/server.js        bundled server (`node dist/server.js --stdio`)
 * dist/data/            engine data read by the server (from the repository's `data/`)
 * dist/lsp4ij/          LSP4IJ custom template (JetBrains IDEs)
 * dist/textmate/        TextMate bundle for syntax highlighting in JetBrains IDEs
 */

const args = parseArgs({ options: { "bundle-only": { type: "boolean", default: false } } }).values;

const packageDir = join(import.meta.dirname, "..");
const distDir = join(packageDir, "dist");
const dataDir = join(packageDir, "..", "..", "data");
/** Release assets are `<prefix>-<os>-<arch>.zip`, see .github/workflows/release.yml. */
const releaseAssetPrefix = "gsc-language-server";

// A bundle-only build (used by the tests) keeps previously built assets.
if (!args["bundle-only"]) await rm(distDir, { recursive: true, force: true });

await build({
	entryPoints: [join(packageDir, "src", "server.ts")],
	outfile: join(distDir, "server.js"),
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node20",
	banner: { js: "#!/usr/bin/env node" },
	logLevel: "warning",
});
console.log("Bundled dist/server.js.");

if (!args["bundle-only"]) {
	const hasData = await stat(dataDir).then(
		(stats) => stats.isDirectory(),
		() => false,
	);
	if (!hasData)
		throw new Error(`Missing ${dataDir}. Run "npm run build:data" in the repository root.`);

	await cp(dataDir, join(distDir, "data"), { recursive: true });
	await writeLsp4ijTemplate(join(distDir, "lsp4ij"));
	await writeTextMateBundle(join(distDir, "textmate"));
	console.log("Wrote dist/data, dist/lsp4ij and dist/textmate.");
}

async function writeJSON(path: string, data: unknown) {
	await writeFile(path, `${JSON.stringify(data, null, "\t")}\n`);
}

async function writeLsp4ijTemplate(dir: string) {
	const engines = await loadEngines(dataDir);
	await mkdir(dir, { recursive: true });

	await writeJSON(join(dir, "template.json"), {
		id: "gsc-language-server",
		name: "GSC (Call of Duty)",
		programArgs: {
			default: 'sh -c "npx --yes gsc-language-server --stdio"',
			windows: "npx.cmd --yes gsc-language-server --stdio",
		},
		// File name patterns rather than a file type, so TextMate highlighting stays active:
		fileTypeMappings: [{ fileType: { patterns: ["*.gsc", "*.csc"] }, languageId: "gsc" }],
	});
	await writeJSON(join(dir, "settings.json"), {
		[SETTINGS_SECTION]: createDefaultSettings(engines),
	});
	await writeJSON(join(dir, "settings.schema.json"), createSettingsSchema(engines));
	await cp(join(packageDir, "lsp4ij", "README.md"), join(dir, "README.md"));

	// The installer downloads the standalone executable from the GitHub releases of this repository
	// (`owner/name`, set by GitHub Actions). Release assets: see .github/workflows/release.yml.
	const repository = process.env.GITHUB_REPOSITORY;
	if (!repository) {
		console.warn("GITHUB_REPOSITORY is not set: the LSP4IJ template has no installer.json.");
		return;
	}
	const [owner, name] = repository.split("/");
	await writeJSON(join(dir, "installer.json"), {
		id: "gsc-language-server-installer",
		name: "GSC language server",
		executeOnStartServer: false,
		check: {
			exec: { name: "Trying current command", command: "${server.command}", timeout: 2000 },
		},
		run: {
			download: {
				name: "Download the GSC language server",
				github: {
					owner,
					repository: name,
					prerelease: false,
					asset: {
						windows: `${releaseAssetPrefix}-windows-x64.zip`,
						unix: { amd64: `${releaseAssetPrefix}-linux-x64.zip` },
						mac: {
							aarch64: `${releaseAssetPrefix}-macos-arm64.zip`,
							amd64: `${releaseAssetPrefix}-macos-x64.zip`,
						},
					},
				},
				output: {
					dir: "$USER_HOME$/.lsp4ij/lsp/gsc-language-server",
					file: {
						name: {
							windows: "gsc-language-server.exe",
							unix: "gsc-language-server",
							mac: "gsc-language-server",
						},
						executable: true,
					},
				},
				onSuccess: {
					configureServer: {
						name: "Configure the GSC language server command",
						command: '"${output.dir}/${output.file.name}" --stdio',
						update: true,
					},
				},
			},
		},
	});
}

async function writeTextMateBundle(dir: string) {
	await mkdir(dir, { recursive: true });
	await cp(join(dataDir, "grammar.json"), join(dir, "grammar.json"));
	await writeJSON(join(dir, "package.json"), {
		name: "gsc-textmate",
		displayName: "GSC (Call of Duty)",
		contributes: {
			languages: [{ id: "gsc", aliases: ["GSC", "Game Script"], extensions: [".gsc", ".csc"] }],
			grammars: [{ language: "gsc", scopeName: "source.gsc", path: "./grammar.json" }],
		},
	});
}
