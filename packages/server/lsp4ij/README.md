# GSC (Call of Duty) language server

Language support for Call of Duty GSC (game script) in JetBrains IDEs (CLion, IntelliJ IDEA, ...)
through [LSP4IJ](https://github.com/redhat-developer/lsp4ij).

> The **GSCLSP** JetBrains plugin does all of this without a template: it bundles the
> server, highlighting and a settings page. Use this template if you can't install the plugin.

## Server

The template's **Installer** tab downloads the standalone server (no Node.js needed) from the
[GitHub releases](https://github.com/SnowyWhite/GSCLSP/releases) and configures the command to run
it. Until then the command is `gsclsp --stdio`, which works if the standalone executable
is on the `PATH`. To use a local build instead, change the command on the **Server** tab:

- `node path/to/GSCLSP/dist/server.js --stdio` (requires [Node.js](https://nodejs.org/) 20.19+)
- `path/to/gsclsp.exe --stdio` (keep the `data` directory next to the executable)

Pass `--data <dir>` to load engine data from a different directory.

## Mappings

`*.gsc` and `*.csc` files are mapped with file name patterns (language ID `gsc`), not a file type,
so TextMate syntax highlighting keeps working.

## Syntax highlighting

Add the TextMate bundle shipped with the server under
**Settings | Editor | TextMate Bundles** (`dist/textmate` in the `gsclsp` package).

## Configuration

Settings are read from the **Configuration** tab (`workspace/configuration`, section `GSC`), which is
validated and completed with `settings.schema.json`. They can also be passed as initialization
options. Without any configuration, the project folder is the default engine's root directory.
Engine-specific settings are keyed by engine ID:

- `GSC.rootDirectories.<engine>`: Root directories containing stock and custom scripts. Later
  directories take precedence. A file inside a root directory uses that directory's engine.
- `GSC.featureSets.<engine>`: Engine feature sets used for completion and semantic highlighting.
- `GSC.defaultEngine`: Engine for files outside of all root directories.
- `GSC.intelliSense.*`, `GSC.colors.enable`: Completion and color picker options.
