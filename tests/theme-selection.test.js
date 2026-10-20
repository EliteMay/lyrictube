const fs=require("node:fs");
const assert=require("node:assert/strict");
const html=fs.readFileSync("index.html","utf8");
const app=fs.readFileSync("app.js","utf8");
const style=fs.readFileSync("styles.css","utf8");
const css=fs.readFileSync("theme.css","utf8");
const choices=[...html.matchAll(/class="theme-btn[^"]*" data-theme="([^"]+)"/g)].map(match=>match[1]);
assert.deepEqual(choices,["dark","ocean","midnight","synthwave","light","sepia"],"expected six selectable themes");
assert.equal(new Set(choices).size,6,"theme choices should not be duplicated");
for(const name of choices){
  assert(style.includes(`.theme-preview-${name}{`),`preview missing: ${name}`);
  assert(css.includes(`body.theme-${name}{`),`theme color owner missing: ${name}`);
}
assert.match(html,/data-theme="ocean"[\s\S]*?オーシャン/,"Ocean should have a visible label");
assert.match(app,/settings:\{theme:"dark"/,"the default must stay Dark");
assert.match(app,/function setTheme\(name\)\{[\s\S]*?library\.settings\.theme=name;[\s\S]*?applyTheme\(\);[\s\S]*?persistLibrary\(\);[\s\S]*?renderThemeButtons\(\);/,"theme must be saved and activated immediately");
assert.match(app,/function applyTheme\(\)\{[\s\S]*?document\.body\.classList\.add\("theme-"\+theme\)/,"stored Ocean theme must apply after reload");
assert.match(app,/function normalizeLibrary\(data\)[\s\S]*?base\.settings=\{\.\.\.base\.settings,\.\.\.\(data\.settings\|\|\{\}\)\}/,"library normalization must keep the saved theme");
console.log("six-theme selection and persistence contracts passed");
