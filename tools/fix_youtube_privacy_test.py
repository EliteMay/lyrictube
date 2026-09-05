from pathlib import Path

p = Path("tests/a1-requirements.test.js")
text = p.read_text(encoding="utf-8")
old = '''assert(app.includes('autoplay:initial?.autoplay?1:0'), "initial iframe creation must preserve autoplay intent");'''
new = '''assert(app.includes('autoplay:initial?.autoplay?"1":"0"'), "initial iframe creation must preserve autoplay intent");'''
if old not in text:
    raise SystemExit("legacy autoplay regression assertion missing")
p.write_text(text.replace(old, new, 1), encoding="utf-8")
