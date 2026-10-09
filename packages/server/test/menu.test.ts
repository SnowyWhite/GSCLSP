import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";
import { menuColors, menuCompletion, menuTokens } from "../src/features/menu";

const document = (text: string) => TextDocument.create("file:///test.menu", "menu", 1, text);

describe("menu editor ranges", () => {
	it("replaces a complete property when completing in its middle", () => {
		const doc = document("{ menuDef { forecolor 1 1 1 1 } }");
		const offset = doc.getText().indexOf("forecolor") + 3;
		const item = menuCompletion(doc, doc.positionAt(offset)).find((i) => i.label === "forecolor")!;
		assert.ok(item.textEdit && "range" in item.textEdit);
		assert.equal(doc.getText(item.textEdit.range), "forecolor");
	});

	it("replaces the whole compound exp property rather than duplicating exp", () => {
		const doc = document("{ menuDef { itemDef { exp rect ");
		const item = menuCompletion(doc, doc.positionAt(doc.getText().length)).find(
			(i) => i.label === "exp rect X",
		)!;
		assert.ok(item.textEdit && "range" in item.textEdit);
		assert.equal(doc.getText(item.textEdit.range), "exp rect ");
		assert.equal(item.textEdit.newText, "exp rect X");
	});

	it("clips semantic tokens to ranges, with UTF-16 positions and no multiline tokens", () => {
		const doc = document('/* 🙂\r\n comment */\r\n{ menuDef { name "☃" } }');
		const range = { start: { line: 1, character: 2 }, end: { line: 2, character: 10 } };
		const tokens = menuTokens(doc, range).data;
		let line = 0;
		let character = 0;
		for (let i = 0; i < tokens.length; i += 5) {
			character = tokens[i] ? tokens[i + 1] : character + tokens[i + 1];
			line += tokens[i];
			assert.ok(line >= range.start.line && line <= range.end.line);
			if (line === range.start.line) assert.ok(character >= range.start.character);
			if (line === range.end.line) assert.ok(character + tokens[i + 2] <= range.end.character);
			assert.ok(
				!/[\r\n]/.test(
					doc.getText({
						start: { line, character },
						end: { line, character: character + tokens[i + 2] },
					}),
				),
			);
		}
		assert.ok(tokens.length > 0);
	});

	it("does not color macro values, comments, expressions or out-of-range components", () => {
		const doc = document(
			'{ menuDef { itemDef { text "forecolor 1 1 1 1" /* backcolor 1 1 1 1 */ forecolor 1 2 0 1 bordercolor COLOR outlinecolor (1) 1 1 1 } } }',
		);
		assert.deepEqual(menuColors(doc), []);
	});
});

describe("OAT color properties", () => {
	it("defaults omitted components to zero across lines and edits only supplied literals", () => {
		const doc = document(
			"{ menuDef { backcolor 1 forecolor 0.5\n0.25 bordercolor 1 /* green */ 0 0.5 itemDef { disablecolor 0.25 } } }",
		);
		const colors = menuColors(doc);
		assert.deepEqual(
			colors.map((entry) => entry.color),
			[
				{ red: 1, green: 0, blue: 0, alpha: 0 },
				{ red: 0.5, green: 0.25, blue: 0, alpha: 0 },
				{ red: 1, green: 0, blue: 0.5, alpha: 0 },
				{ red: 0.25, green: 0, blue: 0, alpha: 0 },
			],
		);
		assert.equal(doc.getText(colors[0].range), "1");
		assert.equal(doc.getText(colors[1].range), "0.5\n0.25");
	});

	it("does not edit partial expressions, macro components or event commands", () => {
		for (const value of [
			"1 COLOR",
			"1 (0.5)",
			"1 + 0.5",
			"1 0 0 1 + 0.5",
			"1 0 0 1 0",
			"1 -0.5",
			"1 #define A 1\n A",
		])
			assert.deepEqual(menuColors(document(`{ menuDef { forecolor ${value} } }`)), [], value);
		assert.deepEqual(
			menuColors(document("{ menuDef { onOpen { setcolor forecolor 1 0 0 1; } } }")),
			[],
		);
	});
});
