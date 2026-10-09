# Neovim

Requires Neovim 0.11+ and `gsc-language-server` on the `PATH` (see the main README).

This directory is a Neovim plugin: it detects `*.gsc`/`*.csc` (filetype `gsc`), adds basic syntax
highlighting and comment settings, and enables the `gsc_ls` language server configuration
(`lsp/gsc_ls.lua`). Functions, methods and parameters are highlighted by the server's semantic tokens.

With [lazy.nvim](https://github.com/folke/lazy.nvim):

```lua
{
	'<owner>/gsc-language-server', -- or `dir = 'path/to/gsc-language-server'`
	config = function(plugin)
		vim.opt.rtp:append(plugin.dir .. '/editors/neovim')
	end,
}
```

Without a plugin manager, add `path/to/gsc-language-server/editors/neovim` to `runtimepath` in
`init.lua` before plugins load: `vim.opt.rtp:append('path/to/gsc-language-server/editors/neovim')`.

## Configuration

The project root is the nearest folder containing `maps` (or `.git`). Without configured root
directories, it is the default engine's root directory.

```lua
vim.lsp.config('gsc_ls', {
	-- Only needed if `gsc-language-server` is not on the PATH:
	cmd = { 'D:/tools/gsc-language-server/gsc-language-server.exe', '--stdio' },
	settings = {
		GSC = {
			defaultEngine = 'iw4',
			rootDirectories = { iw4 = { 'D:/iw4x/raw' } },
		},
	},
})
```

Set `vim.g.gsc_lsp_enable = false` to configure and enable the server yourself.
