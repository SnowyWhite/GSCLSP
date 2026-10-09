import {
	type FileEventKind,
	SCRIPT_FILE_PATTERN,
	fsPathToUri,
	uriToFsPath,
} from "@gsc-language-server/core";
import { type FSWatcher, watch } from "chokidar";
import {
	type ClientCapabilities,
	type Connection,
	DidChangeWatchedFilesNotification,
	type Disposable,
	FileChangeType,
	WatchKind,
} from "vscode-languageserver";

type FileEventHandler = (fsPath: string, kind: FileEventKind) => void;

const scriptFileRegExp = /\.(gsc|csc)$/i;

/**
 * Reports file events in the script root directories. Root directories usually lie outside the
 * workspace (game installs), so the client is only asked to watch them if it supports watchers with
 * a base directory (`relativePatternSupport`). Other clients (e.g. LSP4IJ, which only watches project
 * files) are covered by a server-side chokidar watcher.
 */
export class RootDirectoriesWatcher {
	private readonly connection: Connection;
	private readonly onFileEvent: FileEventHandler;
	readonly useClient: boolean;

	private roots: string[] = [];
	private registration?: Promise<Disposable>;
	private chokidar?: FSWatcher;
	private pending: Promise<void> = Promise.resolve();

	constructor(
		connection: Connection,
		capabilities: ClientCapabilities,
		onFileEvent: FileEventHandler,
	) {
		this.connection = connection;
		this.onFileEvent = onFileEvent;
		const didChangeWatchedFiles = capabilities.workspace?.didChangeWatchedFiles;
		this.useClient = Boolean(
			didChangeWatchedFiles?.dynamicRegistration && didChangeWatchedFiles.relativePatternSupport,
		);

		if (this.useClient) {
			connection.onDidChangeWatchedFiles(({ changes }) => {
				for (const { uri, type } of changes) {
					const fsPath = uriToFsPath(uri);
					if (!fsPath) continue;
					const kind =
						type === FileChangeType.Created
							? "created"
							: type === FileChangeType.Deleted
								? "deleted"
								: "changed";
					onFileEvent(fsPath, kind);
				}
			});
		}
	}

	/** Updates are serialized, so overlapping settings changes can't leak watchers. */
	update(roots: string[]) {
		this.pending = this.pending.then(() => this.apply(roots));
		return this.pending;
	}

	private async apply(roots: string[]) {
		const unique = [...new Set(roots)].sort();
		if (JSON.stringify(unique) === JSON.stringify(this.roots)) return;
		this.roots = unique;

		if (this.useClient) await this.registerClientWatchers();
		else await this.startChokidar();
	}

	private async registerClientWatchers() {
		const previous = this.registration;
		this.registration = undefined;
		(await previous)?.dispose();
		if (this.roots.length === 0) return;

		this.registration = this.connection.client.register(DidChangeWatchedFilesNotification.type, {
			watchers: this.roots.map((root) => ({
				globPattern: { baseUri: fsPathToUri(root), pattern: SCRIPT_FILE_PATTERN },
				kind: WatchKind.Create | WatchKind.Change | WatchKind.Delete,
			})),
		});
		await this.registration;
	}

	private async startChokidar() {
		await this.chokidar?.close();
		this.chokidar = undefined;
		if (this.roots.length === 0) return;

		const watcher = watch(this.roots, {
			ignoreInitial: true,
			ignored: (path, stats) => Boolean(stats?.isFile() && !scriptFileRegExp.test(path)),
		});
		watcher.on("add", (path) => this.onFileEvent(path, "created"));
		watcher.on("change", (path) => this.onFileEvent(path, "changed"));
		watcher.on("unlink", (path) => this.onFileEvent(path, "deleted"));
		watcher.on("error", (error) => this.connection.console.error(`File watcher: ${error}`));
		this.chokidar = watcher;
		// Live before the root directories are scanned, so no file falls between scan and watcher:
		await new Promise<void>((resolve) => watcher.once("ready", resolve));
	}

	async dispose() {
		(await this.registration)?.dispose();
		await this.chokidar?.close();
	}
}
