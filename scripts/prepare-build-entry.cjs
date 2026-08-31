const { writeFileSync } = require('node:fs');

const entryPoint = [
  '<!doctype html>',
  '<html lang="en"><head>',
  '<meta charset="UTF-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
  '<meta name="theme-color" content="#17362e">',
  '<link rel="icon" type="image/svg+xml" href="favicon.svg">',
  '<meta name="description" content="Explore Mosslight Crossing in the Adventure Game field journal.">',
  '<title>Adventure Game — Mosslight Crossing</title>',
  '</head><body><div id="root"></div>',
  '<scr',
  'ipt type="module" src="/src/main.tsx"></scr',
  'ipt>',
  '</body></html>',
].join('');

writeFileSync('index.html', entryPoint);