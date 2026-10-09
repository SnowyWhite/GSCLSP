import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TextDocument } from "vscode-languageserver-textdocument";

import {
	type CallableCall,
	type CallableUsage,
	type GscFile,
	type ParamDef,
	type Range,
	parseCallableDefs,
	parseCallableUsages,
	parseGlobalSegments,
	parseIncludes,
	parseTextSegments,
} from "../src";

const load = (text: string) => {
	const document = TextDocument.create("file:///test.gsc", "gsc", 0, text);
	const textSegments = parseTextSegments(document);
	const globalSegments = parseGlobalSegments(document, textSegments);
	return { document, textSegments, globalSegments };
};

const fixture = load(readFileSync(join(import.meta.dirname, "fixtures", "sample.gsc"), "utf-8"));
const fixtureFile = {} as GscFile;

/** Range of the `occurrence`-th match of `needle` in the fixture. */
const rangeOf = (needle: string, occurrence = 0): Range => {
	const text = fixture.document.getText();
	let offset = -1;
	for (let i = 0; i <= occurrence; i++) {
		offset = text.indexOf(needle, offset + 1);
		assert.notEqual(offset, -1, `"${needle}" #${occurrence} not in fixture`);
	}
	return {
		start: fixture.document.positionAt(offset),
		end: fixture.document.positionAt(offset + needle.length),
	};
};

const textOf = (range: Range | undefined) => fixture.document.getText(range);

describe("parseTextSegments", () => {
	it("finds comments and strings", () => {
		const kinds = [...fixture.textSegments].map(({ range, value }) => [value.kind, textOf(range)]);
		assert.deepEqual(kinds, [
			["comment-line", "// #include maps\\mp\\commented;"],
			["comment-block", textOf({ start: rangeOf("/*").start, end: rangeOf("*/").end })],
			["string", '"ak47_mp"'],
			["comment-line", "// default {"],
			["string", '"spawned"'],
			["string", '"init { not a block"'],
		]);
	});

	it("extends unterminated comments and strings to the end of the document", () => {
		const { document, textSegments } = load('a = "open\nb();\n/* open');
		const segments = [...textSegments].map(({ range, value }) => [
			value.kind,
			document.getText(range),
		]);
		assert.deepEqual(segments, [["string", '"open\nb();\n/* open']]);
	});

	it("does not treat a string's escaped quote as its end", () => {
		const { document, textSegments } = load('a = "say \\"hi\\""; // done');
		const segments = [...textSegments].map(({ range }) => document.getText(range));
		assert.deepEqual(segments, ['"say \\"hi\\""', "// done"]);
	});
});

describe("parseGlobalSegments", () => {
	it("splits the document at top-level blocks, ignoring braces in strings and comments", () => {
		const segments = [...fixture.globalSegments].map(({ range }) => textOf(range).trim());
		assert.equal(segments.length, 3);
		assert.match(segments[0], /^#include[\s\S]*give_weapons\(p, w\)$/);
		assert.equal(segments[1], "init()");
		assert.equal(segments[2], "");
	});

	it("does not close a segment on a nested block's brace", () => {
		const { document, globalSegments } = load("f()\n{\n\tif (1)\n\t{\n\t}\n}\ng()\n{\n}\n");
		const segments = [...globalSegments].map(({ range }) => document.getText(range).trim());
		assert.deepEqual(segments, ["f()", "g()", ""]);
	});
});

describe("parseIncludes", () => {
	it("returns includes outside of comments with their path ranges", () => {
		const includes = parseIncludes(fixture.document, fixture.globalSegments, fixture.textSegments);
		assert.deepEqual(includes.paths, ["maps\\mp\\_utility"]);
		const [include] = [...includes.byRange];
		assert.deepEqual(include.value.path.range, rangeOf("maps\\mp\\_utility"));
	});
});

describe("parseCallableDefs", () => {
	const defs = [
		...parseCallableDefs(
			fixture.document,
			fixture.globalSegments,
			fixture.textSegments,
			fixtureFile,
		),
	].map(({ value }) => value);

	it("finds one definition per top-level block", () => {
		assert.deepEqual(
			defs.map((def) => def.name.text),
			["give_weapons", "init"],
		);
		assert.deepEqual(defs[0].name.range, rangeOf("give_weapons"));
		assert.equal(defs[0].file, fixtureFile);
	});

	it("applies ScriptDoc comments, renaming parameters to the documented names", () => {
		const [giveWeapons] = defs;
		assert.deepEqual(giveWeapons.description, ["Gives weapons to a player."]);
		const params: (ParamDef & { range: Range })[] = giveWeapons.params;
		assert.deepEqual(
			params.map(({ name, optional, description, range }) => ({
				name,
				optional,
				description,
				text: textOf(range),
			})),
			[
				{ name: "player", optional: false, description: ["The player to give to."], text: "p" },
				{ name: "weapon", optional: true, description: ["Weapon name."], text: "w" },
			],
		);
		assert.equal(defs[1].description, undefined);
		assert.deepEqual(defs[1].params, []);
	});

	it("finds parameter usages in the body in document order, skipping strings and comments", () => {
		const usages = [...defs[0].body.variables.params].map(({ range, value }) => ({
			line: range.start.line,
			text: textOf(range),
			index: value.index,
		}));
		const line = (needle: string) => rangeOf(needle).start.line;
		assert.deepEqual(usages, [
			{ line: line("isDefined(w)"), text: "w", index: 1 },
			{ line: line('w = "ak47_mp"'), text: "w", index: 1 },
			{ line: line("p giveWeapon(w)"), text: "p", index: 0 },
			{ line: line("p giveWeapon(w)"), text: "w", index: 1 },
			{ line: line("wait_for(p"), text: "p", index: 0 },
		]);
	});
});

describe("parseCallableUsages", () => {
	const usages = parseCallableUsages(
		fixture.document,
		fixture.globalSegments,
		fixture.textSegments,
	);
	const byName = (name: string) =>
		[...usages].map(({ value }) => value).find((usage) => usage.name.text === name);
	const paramTexts = (usage: CallableUsage | undefined) =>
		[...(usage as CallableCall).params].map(({ value }) => textOf(value.contentRange));

	it("finds calls with their parameters", () => {
		const giveWeapon = byName("giveWeapon");
		assert.equal(giveWeapon?.kind, "call");
		assert.deepEqual(paramTexts(giveWeapon), ["w"]);
		assert.deepEqual(paramTexts(byName("iPrintLn")), ['"init { not a block"']);
	});

	it("finds path-qualified calls and references", () => {
		const waitFor = byName("wait_for");
		assert.equal(waitFor?.kind, "call");
		assert.equal(waitFor?.path?.text, "maps\\mp\\_utility");
		assert.deepEqual(waitFor?.path?.range, rangeOf("maps\\mp\\_utility", 1));
		assert.deepEqual(paramTexts(waitFor), ["p", '"spawned"']);

		const reference = byName("give_weapons");
		assert.equal(reference?.kind, "reference");
		assert.equal(reference?.path, undefined);
		assert.deepEqual(reference?.name.range, rangeOf("give_weapons", 1));
	});

	it("leaves empty parameters without content", () => {
		const { document, globalSegments, textSegments } = load("f()\n{\n\tg( , 1);\n\th();\n}\n");
		const tree = parseCallableUsages(document, globalSegments, textSegments);
		const calls = [...tree].map(({ value }) => value as CallableCall);
		const contents = calls.map((call) =>
			[...call.params].map(
				({ value }) => value.contentRange && document.getText(value.contentRange),
			),
		);
		assert.deepEqual(contents, [[undefined, "1"], [undefined]]);
	});

	it("nests calls inside the parameter lists of enclosing calls", () => {
		const insideIsDefined = rangeOf("isDefined(w)").end;
		const position = { line: insideIsDefined.line, character: insideIsDefined.character - 2 };
		const names = usages.getAt(position).map(({ value }) => value.name.text);
		assert.equal(names.at(-1), "isDefined");
		assert.ok(names.length > 1, "isDefined should be nested in the enclosing call");
	});
});
