/** Zero-based position, same shape as the LSP `Position`. */
export interface Position {
	readonly line: number;
	readonly character: number;
}

/** Same shape as the LSP `Range`. `end` is exclusive. */
export interface Range {
	readonly start: Position;
	readonly end: Position;
}

/** The subset of a text document the parsers rely on. Satisfied by `vscode-languageserver-textdocument`. */
export interface TextDocument {
	readonly uri: string;
	readonly lineCount: number;
	getText(range?: Range): string;
	positionAt(offset: number): Position;
	offsetAt(position: Position): number;
}

export const position = (line: number, character: number): Position => ({ line, character });

export const range = (start: Position, end: Position): Range => ({ start, end });

/** Negative if `a` is before `b`, positive if after, `0` if equal. */
export const comparePositions = (a: Position, b: Position) =>
	a.line === b.line ? a.character - b.character : a.line - b.line;

export const isPositionEqual = (a: Position, b: Position) => comparePositions(a, b) === 0;
export const isPositionBefore = (a: Position, b: Position) => comparePositions(a, b) < 0;
export const isPositionBeforeOrEqual = (a: Position, b: Position) => comparePositions(a, b) <= 0;

export const isRangeEqual = (a: Range, b: Range) =>
	isPositionEqual(a.start, b.start) && isPositionEqual(a.end, b.end);

/** Whether `target` lies within `range`, both ends inclusive. */
export const rangeContains = (range: Range, target: Position | Range): boolean => {
	if ("start" in target)
		return rangeContains(range, target.start) && rangeContains(range, target.end);
	return isPositionBeforeOrEqual(range.start, target) && isPositionBeforeOrEqual(target, range.end);
};

/** Whether the ranges overlap or touch. */
export const rangesIntersect = (a: Range, b: Range) =>
	isPositionBeforeOrEqual(a.start, b.end) && isPositionBeforeOrEqual(b.start, a.end);

export const getEndPosition = (document: TextDocument) =>
	document.positionAt(document.getText().length);

/** Text of a line without its line break. */
export const getLineText = (document: TextDocument, line: number) =>
	document.getText(range(position(line, 0), position(line + 1, 0))).replace(/\r?\n$/, "");

/**
 * Range of the `pattern` match on the position's line that contains the position (start and end
 * inclusive), mirroring VS Code's `TextDocument.getWordRangeAtPosition`.
 */
export const getWordRangeAtPosition = (
	document: TextDocument,
	at: Position,
	pattern: RegExp,
): Range | undefined => {
	const text = getLineText(document, at.line);
	const regExp = new RegExp(
		pattern.source,
		pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
	);
	for (const match of text.matchAll(regExp)) {
		const start = match.index;
		const end = start + match[0].length;
		if (start > at.character) break;
		if (end >= at.character && end > start) {
			return range(position(at.line, start), position(at.line, end));
		}
	}
	return undefined;
};
