import { isAbsolute, relative, resolve } from "node:path";
import { URI } from "vscode-uri";

/**
 * Canonical form of a document URI. Clients encode the same file differently (e.g. VS Code sends
 * `file:///d%3A/x.gsc`, JetBrains IDEs send `file:///D:/x.gsc`), so files are keyed by this form.
 */
export const normalizeUri = (uri: string) => {
	const parsed = URI.parse(uri);
	if (parsed.scheme !== "file") return parsed.toString();
	return URI.file(parsed.fsPath).toString();
};

export const fsPathToUri = (fsPath: string) => URI.file(resolve(fsPath)).toString();

/** File system path of a `file:` URI, `undefined` for other schemes. */
export const uriToFsPath = (uri: string) => {
	const parsed = URI.parse(uri);
	return parsed.scheme === "file" ? parsed.fsPath : undefined;
};

/** Path segments of `fsPath` relative to `root`, or `undefined` if it is not inside `root`. */
export const getRelativePathSegments = (root: string, fsPath: string) => {
	const relativePath = relative(root, fsPath);
	if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return undefined;
	return relativePath.split(/[\\/]/);
};
