if exists('b:current_syntax')
  finish
endif
syntax match codmenuComment "//.*$"
syntax region codmenuComment start="/\*" end="\*/"
syntax region codmenuString start=+"+ skip=+\\.+ end=+"+
syntax match codmenuDirective "^\s*#\s*\w\+"
syntax keyword codmenuKeyword menuDef itemDef functionDef loadMenu name rect text visible onOpen onClose onESC action if else
syntax match codmenuNumber "\<\d\+\(\.\d*\)\?"
highlight default link codmenuComment Comment
highlight default link codmenuString String
highlight default link codmenuDirective PreProc
highlight default link codmenuKeyword Keyword
highlight default link codmenuNumber Number
let b:current_syntax = 'codmenu'
