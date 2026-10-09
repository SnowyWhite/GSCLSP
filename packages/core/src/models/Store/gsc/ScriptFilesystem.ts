import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import glob from "fast-glob";

import { DependencyTracker } from "./DependencyTracker";
import type { GscFile } from "./GscFile";
import type { FileEventKind, GscStore } from "./GscStore";
import { Script } from "./Script";
import { ScriptDir } from "./ScriptDir";

import { fsPathToUri, getRelativePathSegments } from "../../../uri";
import { removeFileExtension } from "../../../util";
import { LayeredValueMap } from "../../Structures/LayeredValueMap";
import { SetMap } from "../../Structures/SetMap";

export const SCRIPT_FILE_PATTERN = "**/*.{gsc,csc}";
const scriptFileRegExp = /\.(gsc|csc)$/i;

export class ScriptFilesystem {
	readonly engineId: string;
	/** Absolute root directories, index is the precedence. */
	readonly roots: readonly string[];
	readonly gscStore: GscStore;

	readonly dependencies: DependencyTracker;
	private readonly scriptRoot: ScriptDir;
	private readonly scriptsByFile: LayeredValueMap<GscFile, Script>;
	private readonly filesByScript: LayeredValueMap<Script, GscFile>;
	private readonly assignments: SetMap<GscFile, Script>;

	constructor(engineId: string, roots: readonly string[], gscStore: GscStore) {
		this.engineId = engineId;
		this.roots = roots;
		this.gscStore = gscStore;

		this.dependencies = new DependencyTracker();
		this.scriptRoot = new ScriptDir("");
		this.scriptsByFile = new LayeredValueMap();
		this.filesByScript = new LayeredValueMap();
		this.assignments = new SetMap();
	}

	async init(warn: (message: string) => void) {
		await Promise.all(
			this.roots.map(async (root, priority) => {
				const isDirectory = await stat(root).then(
					(stats) => stats.isDirectory(),
					() => false,
				);
				if (!isDirectory) {
					warn(
						`Invalid ${this.engineId} GSC root directory: "${root}". Review the GSC.rootDirectories.${this.engineId} setting.`,
					);
					return;
				}

				const paths = await glob(SCRIPT_FILE_PATTERN, {
					cwd: root,
					absolute: true,
					onlyFiles: true,
					caseSensitiveMatch: false,
				});
				for (const path of paths) this.onCreateFile(resolve(path), root, priority);
			}),
		);
	}

	onFileEvent(fsPath: string, kind: FileEventKind) {
		if (!scriptFileRegExp.test(fsPath)) return;
		for (const [priority, root] of this.roots.entries()) {
			if (!getRelativePathSegments(root, fsPath)) continue;
			switch (kind) {
				case "created":
					this.onCreateFile(fsPath, root, priority);
					break;
				case "changed":
					this.onChangeFile(fsPath);
					break;
				case "deleted":
					this.onDeleteFile(fsPath, root, priority);
					break;
			}
		}
	}

	getScriptDirByPath(path: string | string[]) {
		if (path.length === 0) return this.scriptRoot;
		const parsedPath = ScriptFilesystem.parseScriptPath(path);

		let currentDir = this.scriptRoot;
		for (const folder of parsedPath) {
			const childDir = currentDir.children.get(folder);
			if (!childDir) return undefined;
			currentDir = childDir;
		}
		return currentDir;
	}

	getScriptByPath(path: string | string[]) {
		const folders = [...ScriptFilesystem.parseScriptPath(path)];
		const filename = folders.pop();
		if (!filename) return undefined;

		const scriptDir = this.getScriptDirByPath(folders);
		if (!scriptDir) return undefined;

		return scriptDir.scripts.get(filename);
	}

	getScriptByFile(file: GscFile) {
		return this.scriptsByFile.get(file);
	}

	getFileByScript(script: Script) {
		return this.filesByScript.get(script);
	}

	private onCreateFile(fsPath: string, root: string, priority: number) {
		const folders = ScriptFilesystem.parsePath(fsPath, root);
		const filename = folders.pop();
		if (!filename) throw new Error(`Invalid script file path: "${fsPath}"`);

		let currentDir = this.scriptRoot;
		for (const folder of folders) {
			let childDir = currentDir.children.get(folder);
			if (!childDir) {
				childDir = new ScriptDir(folder, currentDir);
				currentDir.children.set(folder, childDir);
			}
			currentDir = childDir;
		}

		let script = currentDir.scripts.get(filename);
		const isNewScript = !script;
		if (!script) {
			script = new Script(filename, currentDir, this);
			currentDir.scripts.set(filename, script);
		}

		const file = this.gscStore.ensureFile(fsPathToUri(fsPath));
		this.scriptsByFile.set(file, priority, script);
		this.filesByScript.set(script, priority, file);
		this.assignments.add(file, script);
		this.gscStore.onFileAssignScript(file, script);

		// The file representing the script may have changed precedence:
		if (isNewScript) script.onCreated();
		else script.onChanged();
	}

	private onChangeFile(fsPath: string) {
		const file = this.gscStore.getFile(fsPathToUri(fsPath));
		if (!file) return;
		file.onChanged();
		this.scriptsByFile.get(file)?.onChanged();
	}

	private onDeleteFile(fsPath: string, root: string, priority: number) {
		const uri = fsPathToUri(fsPath);
		const file = this.gscStore.getFile(uri);
		const script = this.getScriptByPath(ScriptFilesystem.parsePath(fsPath, root));
		if (!script) return; // already removed

		if (file) {
			this.scriptsByFile.delete(file, priority);
			this.assignments.delete(file, script);
			this.gscStore.onFileUnassignScript(file, script);
			this.gscStore.removeFile(uri);
		}
		this.filesByScript.delete(script, priority);

		if (this.filesByScript.get(script)) {
			script.onChanged(); // a file of lower precedence represents this script now
			return;
		}

		script.onChanged();
		let dir = script.dir;
		dir.scripts.delete(script.name);
		while (dir.parent) {
			if (dir.children.size + dir.scripts.size > 0) break;
			dir.parent.children.delete(dir.name);
			dir = dir.parent;
		}
	}

	/** Detaches this filesystem's scripts from the store's files. */
	dispose() {
		for (const [file, scripts] of this.assignments) {
			for (const script of scripts) this.gscStore.onFileUnassignScript(file, script);
		}
	}

	static parseScriptPath(path: string | readonly string[]) {
		return typeof path === "string" ? path.split("\\") : path;
	}

	/** Script path segments (without file extension) of a file inside a root directory. */
	static parsePath(fsPath: string, root: string) {
		const segments = getRelativePathSegments(root, fsPath) ?? [];
		const fileWithExt = segments.pop();
		if (fileWithExt) segments.push(removeFileExtension(fileWithExt));
		return segments;
	}
}
