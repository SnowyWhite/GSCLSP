import type { Segment } from ".";
import {
	type Position,
	type Range,
	isPositionBefore,
	isPositionEqual,
	rangeContains,
} from "../../text";

export const getSegmentIndexAtPos = <T>(
	segments: readonly Segment<T>[],
	position: Position,
	matchEnd = false,
) => {
	const getIsPositionInSegmentRange = matchEnd
		? (segRange: Range) => rangeContains(segRange, position)
		: (segRange: Range) =>
				rangeContains(segRange, position) && !isPositionEqual(segRange.end, position);
	let low = 0;
	let high = segments.length - 1;

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const midRange = segments[mid].range;

		if (getIsPositionInSegmentRange(midRange)) return mid;

		if (isPositionBefore(position, midRange.start)) {
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}
	return -1;
};

export const getSegmentIndicesInRange = <T>(
	segments: readonly Segment<T>[],
	range: Range,
	matchIntersect = false,
) => {
	const getIsSegmentRangeInRange = matchIntersect
		? (segRange: Range) =>
				rangeContains(range, segRange.start) || rangeContains(range, segRange.end)
		: (segRange: Range) => rangeContains(range, segRange);
	let low = 0;
	let high = segments.length - 1;
	const indices: number[] = [];

	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const midRange = segments[mid].range;

		if (getIsSegmentRangeInRange(midRange)) {
			indices.push(mid);
			for (let i = mid - 1; i >= 0; i--) {
				if (!getIsSegmentRangeInRange(segments[i].range)) break;
				indices.unshift(i);
			}
			for (let i = mid + 1; i < segments.length; i++) {
				if (!getIsSegmentRangeInRange(segments[i].range)) break;
				indices.push(i);
			}
			break;
		}

		if (isPositionBefore(range.end, midRange.start)) {
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}
	return indices;
};
