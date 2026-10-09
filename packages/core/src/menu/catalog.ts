import properties from "./catalog.json";
import commands from "./commands.json";

export type MenuScope = "global" | "menu" | "item" | "function" | "event" | "values";
export type MenuEntry = {
	name: string;
	scope: string;
	syntax: string;
	kind: string;
	description?: string;
};

const commandSyntax: Record<string, string> = {
	setdvar: 'setdvar "name" "value";',
	open: 'open "menu";',
	close: 'close "menu";',
	show: 'show "item or group";',
	hide: 'hide "item or group";',
	setfocus: 'setfocus "item";',
	setcolor: "setcolor forecolor|backcolor|bordercolor r [g b a];",
	setitemcolor: 'setitemcolor "item" forecolor|backcolor|bordercolor r [g b a];',
	exec: 'exec "console command";',
	execnow: 'execnow "console command";',
	play: 'play "sound alias";',
};

const commandDescription: Record<string, string> = {
	setcolor:
		"Source accepts optional color components, but the x64 runtime attempts to read four values and can consume subsequent commands. Supply all four components.",
	setitemcolor: "Supply all four color components for runtime command execution.",
	setplayerdatasplitscreen:
		"Recognized by the inspected x64 build, but its handler is empty and performs no action.",
	showgamercard:
		"Recognized by the inspected x64 build, but its handler is empty and performs no action.",
};

/** IW4 vocabulary. Provenance and verification are recorded in doc/menu.md. */
export const menuCatalog: readonly MenuEntry[] = [
	...properties,
	...commands.map((name) => ({
		name,
		scope: "event",
		syntax: commandSyntax[name.toLowerCase()] ?? `${name} arguments;`,
		kind: "command",
		description: commandDescription[name.toLowerCase()],
	})),
];

export const menuEntry = (name: string, scope: MenuScope) =>
	menuCatalog.find(
		(entry) => entry.scope === scope && entry.name.toLowerCase() === name.toLowerCase(),
	);

export const isMenuDocument = (document: { uri: string; languageId: string }) =>
	document.languageId === "menu" || /\.menu(?:[?#]|$)/i.test(document.uri);
