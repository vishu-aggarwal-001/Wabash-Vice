// Cache-busting for GitHub Pages: rewrites play.html so every game module and the stylesheet
// is loaded as file.js?v=<content hash>. Browsers then always fetch a file that changed and
// keep using the cached copy of one that didn't. Run `npm run stamp` before committing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const page = path.join(root, 'play.html');
const hash = (f) => crypto.createHash('sha1').update(fs.readFileSync(path.join(root, f))).digest('hex').slice(0, 8);

const imports = { three: './vendor/three/three.module.js', 'three/addons/': './vendor/three/addons/' };
for (const f of fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).sort()) {
  imports[`./src/${f}`] = `./src/${f}?v=${hash('src/' + f)}`;
}
const map = JSON.stringify({ imports }, null, 2).replace(/\n/g, '\n    ');

let html = fs.readFileSync(page, 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">\n    ${map}\n  </script>`);
html = html.replace(/src="src\/main\.js(\?v=[^"]*)?"/, `src="src/main.js?v=${hash('src/main.js')}"`);
html = html.replace(/href="src\/style\.css(\?v=[^"]*)?"/, `href="src/style.css?v=${hash('src/style.css')}"`);
fs.writeFileSync(page, html);
console.log(`play.html stamped: ${Object.keys(imports).length - 2} modules`);
