import type { CallableDefGame, CallableDefsGameRaw } from "../../Callable";
import type { FeaturesetsScope } from "../../Scope";

export class CallableDefsGameRepo {
	private readonly variantsByName: Map<string, CallableDefGame[]>;

	constructor() {
		this.variantsByName = new Map();
	}

	addRaw(callableDefsRaw: CallableDefsGameRaw) {
		for (const name in callableDefsRaw) {
			const variants = callableDefsRaw[name];
			let storedVariants = this.variantsByName.get(name);
			if (!storedVariants) {
				storedVariants = [];
				this.variantsByName.set(name, storedVariants);
			}
			for (const variant of variants) {
				const scopes = new Map<string, Set<string>>();
				for (const scopeRaw of variant.scopes) {
					const lookupEngine = scopes.get(scopeRaw.engine);
					if (!lookupEngine) {
						scopes.set(scopeRaw.engine, new Set(scopeRaw.featuresets));
						continue;
					}
					for (const featureset of scopeRaw.featuresets) lookupEngine.add(featureset);
				}

				const def: CallableDefGame = {
					...variant,
					name: { text: name },
					origin: "game",
					scopes,
				};
				storedVariants.push(def);
			}
		}
	}

	/** Callables available in the scope, keyed by lowercase name (GSC is case-insensitive). */
	createScoped(scope: FeaturesetsScope): ReadonlyMap<string, CallableDefGame> {
		const result = new Map<string, CallableDefGame>();
		for (const variants of this.variantsByName.values()) {
			for (const variant of variants) {
				const matchingEngineScope = variant.scopes.get(scope.engine);
				if (!matchingEngineScope) continue;
				const isMatch = scope.featuresets.some((featureset) => matchingEngineScope.has(featureset));
				if (!isMatch) continue;
				result.set(variant.name.text.toLowerCase(), variant);
			}
		}
		return result;
	}
}
