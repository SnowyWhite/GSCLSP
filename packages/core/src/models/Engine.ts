import type { Featureset } from "./Featureset";

export type Engine = {
	id: string;
	/** Engine-specific language ID (`gsc-<id>`); clients may send it instead of `gsc` to pin a file to this engine. */
	languageId: string;
	displayName: string;
	gameTitle: string;
	featuresets: Featureset[];
};
