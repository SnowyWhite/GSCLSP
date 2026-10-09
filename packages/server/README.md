# gsc-language-server

Language server for Call of Duty GSC (game script): completion, hover, signature help, go to
definition, semantic tokens, inlay hints and document colors.

```sh
npx gsc-language-server --stdio
```

Options:

- `--stdio`, `--node-ipc`, `--socket=<port>`: Transport.
- `--data <dir>`: Engine data directory (default: `data/` next to the server).

## Configuration

Settings live in the `GSC` section. They are pulled with `workspace/configuration`, or taken from
`workspace/didChangeConfiguration` and `initializationOptions` (`{ "GSC": { ... } }`). Engine-specific
settings are keyed by engine ID (`iw3`, `iw4`):

```json
{
	"GSC": {
		"rootDirectories": { "iw3": ["C:\\games\\iw3\\raw"] },
		"featureSets": { "iw3": { "mp": true, "sp": false } },
		"defaultEngine": "iw3",
		"intelliSense": {
			"enable": { "keywords": true, "callablesGame": "non-deprecated", "callablesScript": true },
			"conciseMode": false,
			"foldersSorting": "inline"
		},
		"colors": { "enable": "quotients" }
	}
}
```

A document's engine is, in order: the engine of the root directory containing it, the engine of its
language ID if it is engine-specific (`gsc-iw3`), `defaultEngine`.

Root directories are watched with `workspace/didChangeWatchedFiles` if the client supports
relative-pattern watchers, otherwise by the server itself.

## JetBrains IDEs

`dist/lsp4ij` is an [LSP4IJ](https://github.com/redhat-developer/lsp4ij) custom template and
`dist/textmate` a TextMate bundle for syntax highlighting. See [lsp4ij/README.md](./lsp4ij/README.md).

## Standalone executable

`npm run build:sea` builds `dist/gsc-language-server(.exe)`, a Node.js single executable application
that doesn't need Node.js installed. Keep the `data` directory next to it.
