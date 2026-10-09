import { resolve } from "node:path";
import { SetMap } from "../../Structures/SetMap";

import type { Settings } from "../../../settings";
import { normalizeUri } from "../../../uri";
import type { Engine } from "../../Engine";

import { GscFile, type OpenDocuments } from "./GscFile";
import type { Script } from "./Script";
import { ScriptFilesystem } from "./ScriptFilesystem";

export type FileEventKind = "created" | "changed" | "deleted";

export type GscStoreOptions = {
	engines: readonly Engine[];
	getSettings: () => Settings;
	openDocuments: OpenDocuments;
	warn: (message: string) => void;
};

export class GscStore {
	private readonly options: GscStoreOptions;

	private readonly files: Map<string, GscFile>;
	/** Script filesystems by engine, with the root directories they were created for. */
	private readonly filesystems: Map<
		Engine["id"],
		{ roots: string; filesystem: Promise<ScriptFilesystem> }
	>;
	private workspaceFolders: readonly string[] = [];
	private readonly scriptsByFile: SetMap<GscFile, Script>;

	constructor(options: GscStoreOptions) {
		this.options = options;

		this.files = new Map();
		this.filesystems = new Map();
		this.scriptsByFile = new SetMap();
	}

	getFile(uri: string) {
		return this.files.get(normalizeUri(uri));
	}

	ensureFile(uri: string) {
		const normalizedUri = normalizeUri(uri);
		let file = this.files.get(normalizedUri);
		if (!file) {
			file = new GscFile(normalizedUri, this.options.openDocuments);
			this.files.set(normalizedUri, file);
		}
		return file;
	}

	removeFile(uri: string) {
		return this.files.delete(normalizeUri(uri));
	}

	/** Script filesystem of an engine's root directories, scanned before the promise resolves. */
	getFilesystem(engineId: Engine["id"]) {
		let entry = this.filesystems.get(engineId);
		if (!entry) {
			const roots = this.getRootDirectories(engineId);
			const instance = new ScriptFilesystem(engineId, roots, this);
			const filesystem = instance.init(this.options.warn).then(() => instance);
			entry = { roots: JSON.stringify(roots), filesystem };
			this.filesystems.set(engineId, entry);
		}
		return entry.filesystem;
	}

	/**
	 * Absolute root directories of an engine, lowest precedence first. Without configured root
	 * directories, the default engine uses the workspace folders, so opening a mod or `raw` folder
	 * as the project works without configuration.
	 */
	getRootDirectories(engineId: Engine["id"]) {
		const settings = this.options.getSettings();
		const paths = settings.rootDirectories[engineId] ?? [];
		if (paths.length === 0 && engineId === settings.defaultEngine)
			return [...this.workspaceFolders];
		return paths.map((path) => resolve(path));
	}

	setWorkspaceFolders(fsPaths: readonly string[]) {
		this.workspaceFolders = fsPaths.map((path) => resolve(path));
		this.onRootDirectoriesChanged();
	}

	/** Drops filesystems whose root directories changed; they are rebuilt on the next request. */
	onRootDirectoriesChanged() {
		for (const [engineId, entry] of this.filesystems) {
			if (entry.roots === JSON.stringify(this.getRootDirectories(engineId))) continue;
			entry.filesystem.then((filesystem) => filesystem.dispose());
			this.filesystems.delete(engineId);
		}
	}

	/** An editor buffer was opened, edited or closed: its contents now differ from what was parsed. */
	onDocumentChanged(uri: string) {
		const file = this.getFile(uri);
		if (!file) return;
		file.onChanged();
		for (const script of this.scriptsByFile.get(file) ?? []) script.onChanged();
	}

	/** An editor buffer was closed. Files outside of script root directories are forgotten. */
	onDocumentClosed(uri: string) {
		const file = this.getFile(uri);
		if (!file) return;
		if (this.scriptsByFile.get(file)) this.onDocumentChanged(uri);
		else this.removeFile(uri);
	}

	/** A file in a root directory was created, changed or deleted on disk. */
	async onFileEvent(fsPath: string, kind: FileEventKind) {
		const entries = [...this.filesystems.values()];
		const filesystems = await Promise.all(entries.map(({ filesystem }) => filesystem));
		for (const filesystem of filesystems) filesystem.onFileEvent(fsPath, kind);
	}

	onFileAssignScript(file: GscFile, script: Script) {
		this.scriptsByFile.add(file, script);
	}

	onFileUnassignScript(file: GscFile, script: Script) {
		this.scriptsByFile.delete(file, script);
	}
}
