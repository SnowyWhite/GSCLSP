import type { Featureset } from "./Featureset";

export type Engine = {
	id: string;
	/** Language ID used by clients with one language per engine (VS Code). */
	languageId: string;
	displayName: string;
	gameTitle: string;
	featuresets: Featureset[];
};
