# Emacs

Requires Emacs 29.1+ (for the built-in Eglot) and `gsclsp` on the `PATH` (or
`exec-path`, see the main README).

`gsc-mode.el` provides `gsc-mode` for `*.gsc`/`*.csc` (highlighting, comments, indentation) and
registers gsclsp with Eglot.

```elisp
(add-to-list 'load-path "path/to/GSCLSP/editors/emacs")
(require 'gsc-mode)
(add-hook 'gsc-mode-hook #'eglot-ensure)
```

Or with `use-package`:

```elisp
(use-package gsc-mode
  :load-path "path/to/GSCLSP/editors/emacs"
  :hook (gsc-mode . eglot-ensure))
```

## Configuration

The project root is the nearest folder containing `maps`. Without configured root directories, it is
the default engine's root directory. Set `gsc-language-server-command` if the server is not on the
`PATH`. Server settings go into `eglot-workspace-configuration` (globally or in `.dir-locals.el`):

```elisp
(setq gsc-language-server-command
      '("/path/to/gsclsp" "--stdio"))
(setq-default eglot-workspace-configuration
              '(:GSC (:defaultEngine "iw4"
                      :rootDirectories (:iw4 ["/path/to/iw4x/raw"]))))
```

