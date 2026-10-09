import type { TextDocument } from "../text";

import { SegmentBuilder, type SegmentMap } from "../models/Segment";
import type { TextSegment } from "../models/SegmentTypes";

export const parseTextSegments = (document: TextDocument): SegmentMap<TextSegment> => {
	const regExp =
		/(?<block>\/\*.*?(?:\*\/|$))|(?<line>\/\/.*?(?=$|[\r\n]))|(?<string>"[^"\\]*(?:\\.[^"\\]*)*(?:"|$))/gs;
	const builder = new SegmentBuilder<TextSegment>();

	for (const match of document.getText().matchAll(regExp)) {
		const text = match[0];
		const { block, line, string } = match.groups!;
		const range = {
			start: document.positionAt(match.index),
			end: document.positionAt(match.index + text.length),
		};

		if (block) builder.set(range, { kind: "comment-block" });
		else if (line) builder.set(range, { kind: "comment-line" });
		else if (string) builder.set(range, { kind: "string" });
	}

	return builder.toMap();
};
