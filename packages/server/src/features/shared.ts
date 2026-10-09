import type {
	CallableDef,
	CallableUsage,
	Engine,
	GscFile,
	ParamDef,
	Stores,
	VariableDef,
} from "@gsclsp/core";
import { type MarkupContent, MarkupKind } from "vscode-languageserver";

/** Callable usages of a file and a lookup for the definition each one refers to. */
export const getCallableContext = async (stores: Stores, file: GscFile, engine: Engine) => {
	const filesystem = await stores.gsc.getFilesystem(engine.id);
	const script = filesystem.getScriptByFile(file);
	const usages = await file.getCallableUsages();
	const scriptDefs = script ? await script.getCallableUsageDefs() : undefined;
	const localDefs = (await file.getCallableDefs()).byName;
	const gameDefs = stores.static.getCallableDefs(engine.id);
	const getDef = (usage: CallableUsage): CallableDef | undefined => {
		const scriptDef = scriptDefs?.get(usage);
		if (scriptDef) return scriptDef;
		if (usage.path) return undefined;
		const name = usage.name.text.toLowerCase();
		return localDefs.get(name) ?? gameDefs.get(name);
	};
	return { usages, getDef };
};

export const getTypesString = (types?: string[]) => (types?.length ? types.join("/") : "");
export const getVariableString = (v: VariableDef) => v.name || getTypesString(v.types) || "unknown";

export const createParamsUsage = (def: CallableDef) => {
	const createParam = (p: ParamDef) =>
		`${p.optional ? "[" : "<"}${getVariableString(p)}${p.optional ? "]" : ">"}`;
	const params = def.params?.map(createParam) ?? [];
	if (def.paramsRepeatable === "all") params.push("...");
	else if (def.paramsRepeatable === "last" && params.length > 0) {
		params[params.length - 1] += "...";
	}
	return params;
};
export const createUsage = (def: CallableDef) => {
	const receiver = def.receiver ? `<${getVariableString(def.receiver)}> ` : "";
	const name = def.name.text;
	const params = createParamsUsage(def).join(", ");
	return `${receiver}${name}(${params})`;
};

export const createDocumentation = (
	def: CallableDef,
	features?: { concise?: boolean; example?: boolean },
) => {
	const concise = features?.concise ?? false;
	const showExample = features?.example ?? true;

	const getVariableDoc = (v: VariableDef | undefined, kind: string) => {
		if (!v) return "";

		const types = getTypesString(v.types);
		return `${concise ? `${kind} ` : `*${kind}* `}${
			v.name ? `\`${v.name}\`${types ? " " : ""}` : ""
		}${types ? `*${types}*` : ""}${v.description ? ` — ${v.description.join("\n")}` : ""}`;
	};

	const isGame = def.origin === "game";
	const receiver = getVariableDoc(def.receiver, concise ? "📥️️" : "@receiver");
	const params =
		def.params
			?.map((p) => getVariableDoc(p, concise ? (p.optional ? "✳️️" : "✴️️") : "@param"))
			.join("\n\n") || "";
	const returns = getVariableDoc(def.return, concise ? "↩️️" : "@return");

	const variables = `\
${receiver ? `${receiver}\n\n` : ""}\
${params ? `${params}\n\n` : ""}\
${returns}`;

	const example =
		def.example && showExample
			? `\
${concise ? "" : "*Example:*\n"}
\`\`\`gsc
${def.example.join("\n")}
\`\`\``
			: "";

	return {
		kind: MarkupKind.Markdown,
		value: `\
${isGame && def.deprecated ? "**👎️ Deprecated**\n\n" : ""}\
${isGame && def.devOnly ? "**🛠️️ Development only**\n\n" : ""}\
${def.description?.join("\n\n") || ""}\
${variables ? `\n***\n${variables}` : ""}\
${example ? `\n***\n${example}` : ""}`,
	} satisfies MarkupContent;
};
