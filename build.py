# Rebuilds index.html from src/.  Usage: python3 build.py
# Add an example by dropping a file into src/samples/ and listing it in SAMPLES below.
import json
SAMPLES = [
    ('Expression grammar (EBNF)', 'arith.ebnf'),
    ('JSON (ABNF, RFC 8259)', 'json.abnf'),
    ('Mini language (ISO 14977 EBNF)', 'iso.ebnf'),
    ('Postal address (BNF)', 'bnf.txt'),
    ('Command-line usage (informal)', 'gam-style.txt'),
]
core = open('src/core.js', encoding='utf-8').read()
tpl = open('src/template.html', encoding='utf-8').read()
samples = [{'name': n, 'text': open('src/samples/' + f, encoding='utf-8').read()} for n, f in SAMPLES]
data = json.dumps(samples).replace('</', '<\\/')
open('index.html', 'w', encoding='utf-8').write(tpl.replace('__CORE__', core).replace('__SAMPLES__', data))
print('index.html written')
