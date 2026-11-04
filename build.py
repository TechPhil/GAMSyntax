# Rebuilds index.html from src/. Usage: python3 build.py
import json
core = open('src/core.js', encoding='utf-8').read()
tpl = open('src/template.html', encoding='utf-8').read()
sample = json.dumps(open('src/sample.txt', encoding='utf-8').read()).replace('</', '<\\/')
open('index.html', 'w', encoding='utf-8').write(tpl.replace('__CORE__', core).replace('__SAMPLE__', sample))
print('index.html written')
