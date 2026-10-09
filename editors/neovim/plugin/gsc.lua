vim.filetype.add({ extension = { gsc = 'gsc', csc = 'gsc' } })

if vim.fn.has('nvim-0.11') == 1 and vim.g.gsc_lsp_enable ~= false then
	vim.lsp.enable('gsc_ls')
end
