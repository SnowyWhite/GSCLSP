-- Language server configuration for Neovim 0.11+ (`vim.lsp.config`/`vim.lsp.enable`).
-- Override fields with `vim.lsp.config('gsc_ls', { ... })`, e.g. `cmd` or `settings`.
-- `gsclsp` from npm, or the standalone executable of a GitHub release. `exepath` also
-- finds npm's `.cmd` shim on Windows, which can't be spawned by its bare name.
local executable = vim.fn.exepath('gsclsp')

---@type vim.lsp.Config
return {
	cmd = { executable ~= '' and executable or 'gsclsp', '--stdio' },
	filetypes = { 'gsc' },
	-- Script paths (maps\mp\_utility) are relative to the folder containing `maps`, so prefer it as the
	-- root: without configured root directories, the server uses it as the default engine's.
	root_markers = { 'maps', '.git' },
	-- The `GSC` section, answered to the server's `workspace/configuration` requests.
	settings = {},
}
