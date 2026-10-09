import type { Range, TextDocument } from "../text";
import { getNextSubstring } from "../util";

import type { CallableUsage } from "../models/Callable";
import {
	SegmentBuilder,
	SegmentBuilderLinear,
	type SegmentMap,
	type SegmentTree,
} from "../models/Segment";
import type { TextSegment } from "../models/SegmentTypes";

export const parseCallableUsages = (
	document: TextDocument,
	globalSegments: SegmentMap,
	textSegments: SegmentMap<TextSegment>,
): SegmentTree<CallableUsage> => {
	const regExp =
		/(?:\b(?<path>[\w\\]+)\s*::\s*)?(?:\b(?<call>[A-Za-z_][\w]*)\b\s*\(|(?<=::\s*)\b(?<reference>[A-Za-z_][\w]*)\b)/dg;
	const builder = new SegmentBuilderLinear<CallableUsage>();

	for (const range of globalSegments.inverted(document)) {
		const bodyOffset = document.offsetAt(range.start);
		const text = document.getText(range);

		for (const match of text.matchAll(regExp)) {
			const { path: pathText, call, reference } = match.groups!;
			const kind = call ? "call" : "reference";
			const nameText = call || reference;

			const [nameStartOffset, nameEndOffset] = match.indices!.groups![kind];
			const nameStart = document.positionAt(bodyOffset + nameStartOffset);
			if (textSegments.hasAt(nameStart)) continue;
			const nameEnd = document.positionAt(bodyOffset + nameEndOffset);
			const name = { text: nameText, range: { start: nameStart, end: nameEnd } };

			let path = undefined;
			if (pathText) {
				const [pathStartOffset, pathEndOffset] = match.indices!.groups!.path;
				const pathStart = document.positionAt(bodyOffset + pathStartOffset);
				const pathEnd = document.positionAt(bodyOffset + pathEndOffset);
				path = { text: pathText, range: { start: pathStart, end: pathEnd } };
			}

			const range = {
				start: document.positionAt(bodyOffset + match.indices![0][0]),
				end: document.positionAt(bodyOffset + match.indices![0][1]),
			};

			if (kind === "reference") {
				builder.push(range, { kind, name, path });
				continue;
			}

			const startIndex = match.indices![0][1];
			let level = 1; // bracket nesting level
			const paramIndices = [startIndex];
			let closingIndex = text.length;

			let i = startIndex;
			parseParams: while (true) {
				const chars = level === 1 ? ["(", ")", ";", ","] : ["(", ")", ";"];
				const next = getNextSubstring(text, chars, i);
				if (!next) break;

				const nextPosition = document.positionAt(bodyOffset + next.index);
				const textSegmentAtPos = textSegments.getAt(nextPosition);
				if (textSegmentAtPos) {
					i = document.offsetAt(textSegmentAtPos.range.end) - bodyOffset;
					continue;
				}

				i = next.index + 1;
				switch (next.substring) {
					case ",":
						paramIndices.push(i);
						break;
					case "(":
						level++;
						break;
					case ")":
						level--;
						if (level === 0) {
							closingIndex = next.index;
							break parseParams;
						}
						break;
					case ";":
						closingIndex = next.index;
						break parseParams;
				}
			}

			const paramsBuilder = new SegmentBuilder<{ contentRange?: Range }>();
			const addParam = (startIndex: number, endIndex: number) => {
				const getContentRange = () => {
					const paramText = text.slice(startIndex, endIndex);
					const match = paramText.match(/^\s*(.*?)\s*$/ds);
					if (!match) return undefined;
					const [trimmedStartOffset, trimmedEndOffset] = match.indices![1];
					if (trimmedStartOffset === trimmedEndOffset) return undefined;
					return {
						start: document.positionAt(bodyOffset + startIndex + trimmedStartOffset),
						end: document.positionAt(bodyOffset + startIndex + trimmedEndOffset),
					};
				};
				const range = {
					start: document.positionAt(bodyOffset + startIndex),
					end: document.positionAt(bodyOffset + endIndex),
				};
				paramsBuilder.set(range, { contentRange: getContentRange() });
			};

			for (let i = 0; i < paramIndices.length - 1; i++) {
				addParam(paramIndices[i], paramIndices[i + 1] - 1);
			}
			addParam(paramIndices[paramIndices.length - 1], closingIndex);

			const callRange = {
				start: range.start,
				end: document.positionAt(bodyOffset + closingIndex + 1),
			};
			builder.push(callRange, {
				kind,
				name,
				path,
				paramList: {
					range: {
						start: document.positionAt(bodyOffset + startIndex - 1),
						end: document.positionAt(bodyOffset + closingIndex),
					},
				},
				params: paramsBuilder.toMap(),
			});
		}
	}

	return builder.toTree();
};
