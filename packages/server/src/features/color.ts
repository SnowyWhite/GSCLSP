import type {
	CancellationToken,
	ColorInformation,
	ColorPresentation,
	ColorPresentationParams,
} from "vscode-languageserver";

import type { DocumentContext } from "../context";

export const provideColorPresentations = ({
	color,
	range,
}: ColorPresentationParams): ColorPresentation[] => {
	const toBase = (value: number, base = 255) => `${Math.round(value * base)}/${base}`;
	const labels = [
		`(${color.red.toFixed(2)}, ${color.green.toFixed(2)}, ${color.blue.toFixed(2)})`,
		`(${toBase(color.red)}, ${toBase(color.green)}, ${toBase(color.blue)})`,
	];
	return labels.map((label) => ({ label, textEdit: { range, newText: label } }));
};

export const provideDocumentColors = async (
	{ document, file, settings }: DocumentContext,
	token: CancellationToken,
): Promise<ColorInformation[]> => {
	const colorsEnabled = settings.colors.enable;
	if (colorsEnabled === "off") return [];

	const textSegments = await file.getTextSegments();
	if (token.isCancellationRequested) return [];

	const regExp =
		/\(\s*(?<r>\d*\.?\d+)\s*(?:\/\s*(?<rb>\d+))?\s*,\s*(?<g>\d*\.?\d+)\s*(?:\/\s*(?<gb>\d+))?\s*,\s*(?<b>\d*\.?\d+)\s*(?:\/\s*(?<bb>\d+))?\s*\)/dg;
	const result: ColorInformation[] = [];

	for (const match of document.getText().matchAll(regExp)) {
		const { r, rb, g, gb, b, bb } = match.groups!;
		if (colorsEnabled === "quotients") {
			if ([rb, gb, bb].some((c) => c === undefined)) continue;
		}
		const getComponent = (value: string, base?: string) =>
			Number(value) / (base ? Number(base) : 1);
		const [red, green, blue] = [getComponent(r, rb), getComponent(g, gb), getComponent(b, bb)];
		if ([red, green, blue].some((c) => c < 0 || c > 1)) continue;

		const startIndex = match.indices![0][0];
		const endIndex = match.indices![0][1];
		const start = document.positionAt(startIndex);
		if (textSegments.hasAt(start)) continue;

		result.push({
			color: { red, green, blue, alpha: 1 },
			range: { start, end: document.positionAt(endIndex) },
		});
	}
	return result;
};
