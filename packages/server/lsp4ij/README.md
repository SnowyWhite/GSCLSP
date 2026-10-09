# GSC (Call of Duty) language server

Language support for Call of Duty GSC (game script) in JetBrains IDEs (CLion, IntelliJ IDEA, ...)
through [LSP4IJ](https://github.com/redhat-developer/lsp4ij).

## Server

The template starts the server with `npx --yes gsc-language-server --stdio`, which requires
[Node.js](https://nodejs.org/) 20.19 or newer. To use a local build or the standalone executable
instead, change the command on the **Server** tab:

- `node path/to/gsc-language-server/dist/server.js --stdio`
- `path/to/gsc-language-server.exe --stdio` (keep the `data` directory next to the executable)

Pass `--data <dir>` to load engine data from a different directory.

## Mappings

`*.gsc` and `*.csc` files are mapped with file name patterns (language ID `gsc`), not a file type,
so TextMate syntax highlighting keeps working.

## Syntax highlighting

Add the TextMate bundle shipped with the server under
**Settings | Editor | TextMate Bundles** (`dist/textmate` in the `gsc-language-server` package).

## Configuration

Settings are read from the **Configuration** tab (`workspace/configuration`, section `GSC`) and can
also be passed as initialization options. Engine-specific settings are keyed by engine ID:

- `GSC.rootDirectories.<engine>`: Root directories containing stock and custom scripts. Later
  directories take precedence. A file inside a root directory uses that directory's engine.
- `GSC.featureSets.<engine>`: Engine feature sets used for completion and semantic highlighting.
- `GSC.defaultEngine`: Engine for files outside of all root directories.
- `GSC.intelliSense.*`, `GSC.colors.enable`: See the main README.
