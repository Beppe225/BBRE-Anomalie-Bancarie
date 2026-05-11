// setup-dirs.js
const fs = require('fs');
const path = require('path');

const dirs = [
  'src/main', 'src/renderer', 'src/db/migrations',
  'src/engine/math', 'src/engine/normativa', 'src/reports/templates',
  'src/market', 'src/config', 'src/preload', 'src/engine/__tests__'
];

dirs.forEach(dir => {
  fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
  console.log(`✅ Creato: ${dir}`);
});