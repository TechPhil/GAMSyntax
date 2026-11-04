EBNF viewer
===========
Open index.html in any modern browser (double-click it). It is one self-contained
file: no server, no internet, no external scripts or fonts. Everything is parsed
locally in the browser.

Load a grammar with "Open file", drag and drop, or "Paste text". Use the Examples
menu to see each supported notation.

Supported notations (Syntax menu, default is auto-detect)
  EBNF / BNF   W3C  (::=, ? * +, [a-z], #x41, A - B)
               ISO 14977  (=, commas, { }, [ ], ;, names with spaces)
               BNF  (<name> ::= ...) and ANTLR-style rules (name : ... ;)
               comments: (* *)  /* */  //  #
  ABNF         RFC 5234  (%x41-5A, 1*DIGIT, 3*5 x, =/ , ; comments)
  Informal     command usage lines such as "tool print users [todrive] ..." plus rule
               definitions. Gives a Commands list in addition to everything below.

Features
  Rules tab      every rule as a railroad diagram; click any blue box to open that rule
  Explore tab    type text and see what can legally come next. Command-style files
                 suggest the next word and list the matching commands. Every other
                 grammar suggests the next keyword, character or value, shows the
                 rules you are currently inside, and says when the text is complete.
                 Pick any rule as the start rule.
  Issues tab     undefined names (with "did you mean"), duplicate rules, unreferenced
                 rules, unbalanced brackets, all with line numbers
  Export         converts the whole grammar to one consistent W3C EBNF text

Files
  index.html            ready-to-use build
  src/core.js           parsers, railroad layout, EBNF export (no DOM)
  src/template.html     interface and styles
  src/samples/          the built-in examples
  src/test.js           node test:  cd src && node test.js [your-grammar-files]
  build.py              rebuilds index.html from src/  (python3 build.py)
