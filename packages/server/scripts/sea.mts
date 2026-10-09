import { execFileSync } from "node:child_process";
import { copyFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Builds a standalone executable (Node.js single executable application) from dist/server.js, so
 * clients don't need Node.js installed. The executable reads `data/` from its own directory.
 * Run `npm run build` first.
 */

const packageDir = join(import.meta.dirname, "..");
const distDir = join(packageDir, "dist");
const serverPath = join(distDir, "server.js");
const blobPath = join(distDir, "sea-prep.blob");
const configPath = join(distDir, "sea-config.json");
const executablePath = join(
	distDir,
	process.platform === "win32" ? "gsc-language-server.exe" : "gsc-language-server",
);

await stat(serverPath).catch(() => {
	throw new Error(`Missing ${serverPath}. Run "npm run build" first.`);
});

await writeFile(
	configPath,
	JSON.stringify({ main: serverPath, output: blobPath, disableExperimentalSEAWarning: true }),
);
execFileSync(process.execPath, ["--experimental-sea-config", configPath], { stdio: "inherit" });

await copyFile(process.execPath, executablePath);
if (process.platform === "darwin") {
	execFileSync("codesign", ["--remove-signature", executablePath], { stdio: "inherit" });
}

const postjectArgs = [
	executablePath,
	"NODE_SEA_BLOB",
	blobPath,
	"--sentinel-fuse",
	"NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
];
if (process.platform === "darwin") postjectArgs.push("--macho-segment-name", "NODE_SEA");
const postject = join(packageDir, "..", "..", "node_modules", "postject", "dist", "cli.js");
execFileSync(process.execPath, [postject, ...postjectArgs], { stdio: "inherit" });

if (process.platform === "darwin") {
	execFileSync("codesign", ["--sign", "-", executablePath], { stdio: "inherit" });
}

await rm(blobPath);
await rm(configPath);
console.log(`Built ${executablePath}.`);
