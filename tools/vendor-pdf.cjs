// Mechanical packaging of the installed Mozilla PDF.js distribution for file:// and offline use.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = path.resolve(process.argv[2] || 'node_modules/pdfjs-dist');
const target = path.resolve(__dirname, '../vendor');
const version = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8')).version;
fs.mkdirSync(target, { recursive: true });
for (const [input, output] of [['pdf.min.mjs', 'pdf.js'], ['pdf.worker.min.mjs', 'pdf.worker.js']]) {
  let code = fs.readFileSync(path.join(source, 'legacy/build', input), 'utf8');
  if (!/export\s*\{[^}]+\};\s*$/.test(code)) throw new Error('Unexpected PDF.js export format');
  code = code.replace(/export\s*\{[^}]+\};\s*$/, '').replace(/import\.meta\.url/g, '__emmaPdfScriptUrl');
  const bundle = `/* Mozilla PDF.js ${version}; Apache-2.0. See PDFJS-LICENSE.txt. */\n(async function(){\nconst __emmaPdfScriptUrl = document.currentScript?.src || location.href;\n${code}\n})();\n`;
  new vm.Script(bundle);
  fs.writeFileSync(path.join(target, output), bundle);
}
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'PDFJS-LICENSE.txt'));
console.log(`Packaged PDF.js ${version} for local, offline reading.`);
