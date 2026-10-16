import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMenuDocument, menuCatalog, menuScopeAt, parseMenu } from "../src/index";

describe("IW4 menu source model", () => {
	it("recognizes the language ID and menu extension without claiming headers", () => {
		assert.ok(isMenuDocument({ uri: "untitled:test", languageId: "menu" }));
		assert.ok(isMenuDocument({ uri: "file:///test.MENU", languageId: "plaintext" }));
		assert.ok(!isMenuDocument({ uri: "file:///test.h", languageId: "cpp" }));
	});

	it("tracks menu, item, function and nested event scopes with same-line properties", () => {
		const text =
			'{ functionDef { name "enabled" value dvarInt("test") } menuDef { name "main" itemDef { name "button" action { if (enabled()) { open main; } else { close main; } } } } }';
		const parsed = parseMenu(text);
		assert.deepEqual(parsed.issues, []);
		assert.deepEqual(
			parsed.definitions.map((d) => [d.name, d.kind]),
			[
				["enabled", "function"],
				["main", "menu"],
				["button", "item"],
			],
		);
		assert.equal(menuScopeAt(parsed, text.indexOf("open main")), "event");
		assert.equal(menuScopeAt(parsed, text.indexOf('name "button"')), "item");
		assert.equal(menuScopeAt(parsed, text.indexOf('name "main"')), "menu");
	});

	it("does not interpret strings, comments or continued macro bodies as structure", () => {
		const text =
			'#define BUTTON(x) itemDef { \\\r\n name x \\\r\n }\r\n{ menuDef { name "a" // }\r\n text "escaped \\" {" /* } */ } }';
		const parsed = parseMenu(text);
		assert.deepEqual(parsed.issues, []);
		assert.equal(parsed.blocks.filter((b) => b.scope === "item").length, 0);
		assert.equal(parsed.definitions[0].name, "BUTTON");
	});

	it("retains include locations and loadMenu paths", () => {
		const text = '#include "ui_mp/common.inc"\n{ loadMenu { "ui_mp/main.menu" } }';
		const parsed = parseMenu(text);
		assert.deepEqual(
			parsed.includes.map((i) => text.slice(i.start, i.end)),
			["ui_mp/common.inc", "ui_mp/main.menu"],
		);
	});

	it("reports incomplete strings, comments and delimiters without throwing", () => {
		for (const text of [
			'menuDef { name "unfinished',
			"/* unfinished",
			"{ menuDef { name test }",
			"}",
		]) {
			assert.ok(parseMenu(text).issues.length > 0, text);
		}
		assert.deepEqual(parseMenu("").issues, []);
	});

	it("does not reject delimiters supplied by macros or conditional branches", () => {
		assert.deepEqual(
			parseMenu("#if PC\nmenuDef {\n#else\nmenuDef {\n#endif\nname test\n}").issues,
			[],
		);
		assert.deepEqual(parseMenu('#include "open.inc"\n}').issues, []);
	});

	it("separates value lists and key handlers from item properties", () => {
		const text =
			'{ menuDef { name main itemDef { dvarStrList { "one" "1" } execKey "a" { setdvar "x" "1"; } } } }';
		const parsed = parseMenu(text);
		assert.equal(menuScopeAt(parsed, text.indexOf('"one"')), "values");
		assert.equal(menuScopeAt(parsed, text.indexOf("setdvar")), "event");
	});

	it("keeps completion inside an unfinished block at EOF and outside a handler header", () => {
		const incomplete = "{ menuDef { itemDef { ";
		assert.equal(menuScopeAt(parseMenu(incomplete), incomplete.length), "item");
		const text = "{ menuDef { onOpen { } } }";
		assert.equal(menuScopeAt(parseMenu(text), text.indexOf("onOpen") + 2), "menu");
	});

	it("ships IW4 vocabulary without IW5-only properties", () => {
		assert.ok(menuCatalog.some((e) => e.name === "dvarint" && e.scope === "expression"));
		assert.ok(menuCatalog.some((e) => e.name === "onOpen" && e.scope === "menu"));
		assert.ok(!menuCatalog.some((e) => e.name === "onFocusDueToClose" || e.name === "hasFocus"));
	});
});

describe("OAT source string values", () => {
	it("decodes source escapes while preserving source locations", () => {
		const text = String.raw`{ menuDef { name "a\r\n\t\f\\\"\q" } }`;
		const parsed = parseMenu(text);
		assert.deepEqual(parsed.issues, []);
		assert.equal(parsed.definitions[0].name, 'a\r\n\t\f\\"q');
		assert.equal(
			text.slice(parsed.definitions[0].start, parsed.definitions[0].end),
			String.raw`"a\r\n\t\f\\\"\q"`,
		);
	});

	it("does not advertise runtime-only functions unsupported by the source compiler", () => {
		for (const name of [
			"dowehavemappack",
			"cantogglefullscreen",
			"isbasegamelicensevalid",
			"isprofilesyncedwithcloud",
			"getstoremismatchmessagegdk",
			"getpartyinvitedescription",
		])
			assert.ok(!menuCatalog.some((entry) => entry.name === name));
	});
});
