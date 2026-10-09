import type { TextDocument } from "../text";

import type { Include } from "../models/Include";
import { SegmentBuilder, type SegmentMap } from "../models/Segment";
import type { TextSegment } from "../models/SegmentTypes";

export const parseIncludes = (
	document: TextDocument,
	globalSegments: SegmentMap,
	textSegments: SegmentMap<TextSegment>,
): { byRange: SegmentMap<Include>; paths: string[] } => {
	const regExp = /#include\s*(\b[\w\\]+)/dg;
	// The first global segment starts at offset 0, so match offsets are document offsets.
	const text = document.getText(globalSegments.getByIndex(0)?.range);
	const builder = new SegmentBuilder<Include>();
	const paths = new Set<string>();

	for (const match of text.matchAll(regExp)) {
		const [startOffset, endOffset] = match.indices![0];
		const startPosition = document.positionAt(startOffset);
		if (textSegments.hasAt(startPosition)) continue;

		const range = { start: startPosition, end: document.positionAt(endOffset) };

		const pathText = match[1];
		const [pathStartOffset, pathEndOffset] = match.indices![1];
		const pathRange = {
			start: document.positionAt(pathStartOffset),
			end: document.positionAt(pathEndOffset),
		};
		builder.set(range, { path: { text: pathText, range: pathRange } });
		paths.add(pathText);
	}

	return { byRange: builder.toMap(), paths: [...paths] };
};
