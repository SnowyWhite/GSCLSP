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

See [packages/server/README.md](./packages/server/README.md) for options and configuration, and
[packages/server/lsp4ij/README.md](./packages/server/lsp4ij/README.md) for JetBrains IDE setup.

## Layout

- `packages/core`: Editor-independent parsers, models and stores.
- `packages/server`: The language server, bundled into `dist/server.js`. The build also writes an
  LSP4IJ template (`dist/lsp4ij`) and a TextMate bundle for syntax highlighting (`dist/textmate`).
- `build/`: Fetches the engine documentation from gsc-doc into `data/`.

## Development

```sh
npm install
npm run build        # data/ and packages/server/dist
npm test             # parser unit tests and a language server integration test over stdio
npm run typecheck
npm run build:sea -w packages/server   # optional standalone executable (no Node.js needed)
```

## License

MIT, see [LICENSE](./LICENSE).
