import type { ExtensionContext } from "vscode";
import {
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext) {
	// The server is bundled next to this file, with its `data/` directory, and runs in VS Code's Node.js.
	const module = context.asAbsolutePath("server.js");
	const serverOptions: ServerOptions = {
		run: { module, transport: TransportKind.ipc },
		debug: { module, transport: TransportKind.ipc, options: { execArgv: ["--inspect=6009"] } },
	};
	// Settings are pulled by the server (`workspace/configuration`, section `GSC`).
	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ language: "gsc" }],
	};

	client = new LanguageClient("gsc", "GSCLSP", serverOptions, clientOptions);
	await client.start();
}

export function deactivate() {
	return client?.stop();
}
