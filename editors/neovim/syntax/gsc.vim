" Basic syntax for Call of Duty GSC. Functions, methods and parameters are highlighted by the
" language server's semantic tokens.
if exists('b:current_syntax')
  finish
endif

syntax keyword gscKeyword break breakpoint call case childthread continue default else endon for
syntax keyword gscKeyword foreach if in notify prof_begin prof_end return switch thisthread thread
syntax keyword gscKeyword wait waittill waittillframeend waittillmatch while
syntax keyword gscConstant true false undefined
syntax keyword gscBuiltin self level game anim
syntax match gscDirective /#\(include\|using_animtree\|animtree\)\>/
syntax match gscNumber /\<\d\+\(\.\d\+\)\?\>/
syntax match gscNumber /\.\d\+\>/
syntax region gscString start=/&\?"/ skip=/\\./ end=/"/
syntax match gscLineComment /\/\/.*$/
syntax region gscBlockComment start=/\/\*/ end=/\*\//
syntax region gscDevBlock matchgroup=gscDevDelimiter start=/\/#/ end=/#\// transparent

highlight default link gscKeyword Keyword
highlight default link gscConstant Constant
highlight default link gscBuiltin Identifier
highlight default link gscDirective PreProc
highlight default link gscNumber Number
highlight default link gscString String
highlight default link gscLineComment Comment
highlight default link gscBlockComment Comment
highlight default link gscDevDelimiter PreProc

let b:current_syntax = 'gsc'
