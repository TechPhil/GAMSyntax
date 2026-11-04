GAM syntax viewer
=================
Open index.html in any modern browser (double-click it). It is one self-contained
file: no server, no internet, no external scripts or fonts.

Click "Open GAM file" (or drag the file onto the page, or use "Paste text") to load
your GAM syntax document. Parsing happens locally in the browser.

Layout
  index.html            ready-to-use build
  src/core.js           tokenizer, parser, railroad layout, EBNF export (no DOM)
  src/template.html     UI and styles
  src/sample.txt        built-in sample excerpt
  src/test.js           node test:  cd src && node test.js
  build.py              rebuilds index.html from src/
