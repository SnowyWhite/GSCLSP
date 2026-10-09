# Call of Duty menu support

`.menu` files use the `menu` language ID. The built-in vocabulary targets IW4 / IW4x,
independently of the GSC engine documentation. VS Code, the JetBrains plugin and
LSP4IJ template, Neovim (`codmenu` filetype), and Emacs (`cod-menu-mode`) register it.
Other clients should associate `*.menu` with `menu` and start `gsclsp --stdio`.
The server also recognizes the extension when a client sends another language ID.
Headers keep their existing editor association; a menu header can be assigned the
`menu` language manually.

Implemented features:

- Completion for menu/item/function properties, UI event commands, expression
  functions, preprocessor directives, and macros/functions defined in the current file.
- Hover showing built-in syntax and local macro definitions.
- Go to definition for quoted/angle-bracket includes, quoted `loadMenu` paths,
  macros and custom expression functions in the file or its includes, local menu
  names, and item references within their containing menu.
- Nested document symbols, block folding, semantic and TextMate highlighting.
- Color swatches for properties with one to four literal components; omitted
  components default to zero, including alpha. Color edits write all four RGBA values.
- Versioned diagnostics for unterminated strings/comments and unmatched delimiters.
  Diagnostics clear on document close.

Includes use the selected engine's configured `GSC.rootDirectories` (or the
workspace fallback), matching OAT content-root lookup. The including file's
directory is not an implicit search root. Open, unsaved
buffers take precedence over disk. Disk files use Windows-1252, matching game
assets. Navigation reads includes on demand, with cycle detection, a depth limit
of 16, a 64-document budget and a 2 MiB limit per disk file.

This is an editor source model, not a menu compiler. It does not expand macros or
choose conditional-preprocessor branches. Macro bodies are opaque; delimiter
diagnostics are suppressed when preprocessing directives are present because
includes/macros may supply matching delimiters. It does not diagnose unknown
properties, evaluate expressions, validate item-type restrictions, search the
whole workspace for menu names, or provide menu signature help/inlay hints.
Macro navigation does not evaluate `#undef`, redefinitions or branch conditions.
Quoted menu/item/function names decode OAT source escapes for navigation while
preserving original source ranges. Color expressions are not evaluated for swatches.
The six x64-only expression functions remain excluded from source completions
because the inspected staging compiler does not support them. Command hovers
identify known x64 no-op handlers and explain why runtime color commands should
supply all four components.
The IW4 vocabulary is not an assertion of compatibility with IW3 or IW5.

## Source and IDA evidence

The follow-up [x64 menu research](menu-x64-research.md) traces the actual asset
loaders, event dispatcher, runtime lexer and expression evaluator in
`iw4mp_x64.i64`. It independently confirms all 59 command names, identifies six
additional runtime expression names, and records the limits of source-parser
validation. The normal executable path loads compiled assets; staging's OAT
compiler handles loose source. The [extracted tables](menu-x64-evidence.json)
retain addresses and target identity.

The initial source and 32-bit investigation is recorded below for provenance.

The reference checkout was `github/staging`, commit
`1549dba0f690e3a991a3e156b27e81cb9a55ed61`.

- `libiw4x/libiw4x/mod/menu.cxx`: loose menu overrides are compiled through the
  OpenAssetTools menu cache, then registered as menu-list assets. Source parsing
  therefore follows the vendored parser, not GSC's grammar.
- `upstream/open-asset-tools/src/ObjLoading/Parsing/Menu/MenuFileReader.cpp`:
  comment removal, includes and defines precede parsing; the lexer ignores
  newlines and supports escaped strings. Predefined symbols include `PC` and
  `FEATURE_LEVEL_IW4`.
- `.../Parsing/Menu/Sequence/{Global,Menu,Item,Function}ScopeSequences.cpp`:
  `menuDef`, `itemDef`, `functionDef`, `loadMenu`, property spellings, numeric and
  expression forms, RGBA colors, event blocks, and optional rectangle alignment.
  IW5-only registrations are excluded from the checked-in IW4 property catalog.
- `.../Parsing/Menu/Sequence/EventHandlerSetScopeSequences.cpp` and
  `.../Parsing/Menu/Matcher/MenuExpressionMatchers.cpp`: nested event conditions,
  local-variable assignments, and custom expression functions without arguments.
- `upstream/open-asset-tools/src/ObjCommon/Game/IW4/MenuConstantsIW4.h`:
  expression-function spellings (excluding internal/static opcodes).

IDA Pro 9.2, `idb/iw4mp_steam.i64`, SHA-256 of input executable
`2473ea3be5232caad803194d5d431af4d99fed1517eedf61c93fb741959052ce`:

- `Item_RunScript`, `0x5A49F0`: skips semicolon tokens and dispatches commands
  using `I_stricmp`; also recognizes `uiScript`. The 59-entry command table at
  `0x6AB1E8` supplies the spellings in `commands.json` (8-byte name/function pairs).
- `Script_SetDvar`, `0x5A38E0`: consumes two string arguments before calling
  `Dvar_SetFromStringByName`, confirming `setdvar "name" "value";` syntax.

These are syntax observations from the 32-bit Steam reference. No addresses,
calling conventions or object layouts are used by the language server. The IDB
was queried read-only; it was not renamed, patched or used to infer x64 bindings.
The catalog records language facts rather than copying parser implementations.
To update it, compare the IW4 registrations above and the engine command table;
keep IW5-only blocks excluded. Both editor grammars are generated from the same
catalog as completion and hover.

## Validation

`npm test` runs the source-model tests and real stdio LSP requests, including GSC
regression tests. `npm run typecheck`, `npm run check`, and `npm run build` validate
the TypeScript sources and generated editor assets. The menu tests need no IDA,
game installation, or network access after dependencies are installed.
