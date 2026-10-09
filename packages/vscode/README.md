# GSC Language Server for VS Code

Call of Duty GSC (game script, IW3 and IW4) support through gsc-language-server: code completion,
hover documentation, signature help,
go to definition, semantic and TextMate highlighting, parameter name inlay hints and a color picker
for color vectors. The language server is bundled; no further installation is needed.

> Not affiliated or associated with [Muhlex/vscode-gsc](https://github.com/Muhlex/vscode-gsc), whose
> MIT-licensed code this project is derived from. Don't enable both extensions at once.

## Configuration

Open your scripts folder (the folder containing `maps`) and it works without configuration: without
root directories, the workspace folder is the default engine's root directory.

- `GSC.rootDirectories.<engine>`: Folders with stock or custom scripts (e.g. the game's raw files).
  Later folders take precedence. Files in a root directory use its engine.
- `GSC.defaultEngine`: Engine of files outside of all root directories.
- `GSC.featureSets.<engine>.*`: Engine feature sets used for completion and highlighting.
- `GSC.intelliSense.*`, `GSC.colors.enable`: Completion and color picker options.
