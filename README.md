# gsc-language-server

A language server (LSP) for Call of Duty GSC (game script), supporting the IW3 and IW4 engines.
It works with any LSP client, e.g. JetBrains IDEs (CLion, IntelliJ IDEA, ...) through
[LSP4IJ](https://github.com/redhat-developer/lsp4ij).

Features: code completion (engine and script functions, script paths, keywords, snippets), hover
documentation (including ScriptDoc), signature help, go to definition, semantic highlighting,
parameter name inlay hints and a color picker for color vectors.

> [!NOTE]
> This project is **not affiliated or associated** with
> [Muhlex/vscode-gsc](https://github.com/Muhlex/vscode-gsc). It is derived from that project's
> MIT-licensed source code (parsers and models), reworked into an editor-independent language server.
> Engine documentation comes from [Muhlex/gsc-doc](https://github.com/Muhlex/gsc-doc).

## Usage

### JetBrains IDEs (CLion, IntelliJ IDEA, ...)

Install the **GSC Language Server** plugin (`gsc-language-server-jetbrains-<version>.zip` from a
GitHub release: **Settings | Plugins | ⚙ | Install Plugin from Disk...**). It installs
[LSP4IJ](https://plugins.jetbrains.com/plugin/23257-lsp4ij) as a dependency and brings the server,
syntax highlighting and a settings page (**Settings | Languages & Frameworks | GSC**).

Open your scripts folder (e.g. a mod or `raw` folder) as the project and it works without
configuration: without root directories, the project folder is the default engine's root directory.
Add the game's stock script folders as root directories for completion and navigation into them.

The plugin runs the bundled server with Node.js from the `PATH`. Without Node.js, it downloads the
standalone server from the GitHub release of its version.

Without the plugin, use the LSP4IJ template instead, see
[packages/server/lsp4ij/README.md](./packages/server/lsp4ij/README.md).

### VS Code

Install `gsc-language-server-vscode-<version>.vsix` from a GitHub release (**Extensions | ⋯ |
Install from VSIX...**). The server is bundled. See [packages/vscode/README.md](./packages/vscode/README.md).
Don't enable it together with Muhlex/vscode-gsc.

### Neovim and Emacs

See [editors/neovim](./editors/neovim/README.md) (Neovim 0.11+) and
[editors/emacs](./editors/emacs/README.md) (Emacs 29+, Eglot). Both start `gsc-language-server` from
the `PATH`. Get it with one of:

- the standalone executable from a GitHub release (`gsc-language-server-<os>-<arch>.zip`, keep
  `data/` next to it, no Node.js needed): add its folder to the `PATH`;
- Node.js 20.19+: `npm run build` in this repository, then `npm install -g ./packages/server`.

### Other editors

The server works with any LSP client (`gsc-language-server --stdio`), see
[packages/server/README.md](./packages/server/README.md) for options and configuration.

## Layout

- `packages/core`: Editor-independent parsers, models and stores.
- `packages/server`: The language server, bundled into `dist/server.js`. The build also writes an
  LSP4IJ template (`dist/lsp4ij`) and a TextMate bundle for syntax highlighting (`dist/textmate`).
- `packages/vscode`: The VS Code extension, a language client bundling the server.
- `jetbrains/`: The JetBrains plugin (Gradle, Kotlin), built on LSP4IJ.
- `editors/neovim`, `editors/emacs`: Neovim plugin and Emacs major mode with Eglot setup.
- `build/`: Fetches the engine documentation from gsc-doc into `data/`.

## Development

```sh
npm install
npm run build        # data/, packages/server/dist and packages/vscode/dist
npm run package -w packages/vscode     # VS Code .vsix
npm test             # parser unit tests and a language server integration test over stdio
npm run typecheck
npm run build:sea -w packages/server   # optional standalone executable (no Node.js needed)

cd jetbrains
./gradlew buildPlugin     # needs `npm run build` first; writes build/distributions/*.zip
./gradlew runIde          # IDE sandbox with the plugin
```

`-PplatformLocalPath=<IDE install dir>` builds against a local IDE instead of downloading CLion.

## Releases

Pushing a `v<version>` tag runs `.github/workflows/release.yml`, which publishes the standalone
servers (`gsc-language-server-<os>-<arch>.zip`), the LSP4IJ template (with an installer for the
standalone server), the TextMate bundle and the JetBrains plugin. Keep the `version` of `packages/vscode/package.json`, `pluginVersion` in
`jetbrains/gradle.properties` and the tag in sync: the plugin downloads the standalone server of
its own version.

## License

MIT, see [LICENSE](./LICENSE).
