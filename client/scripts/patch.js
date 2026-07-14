const fs = require('fs');

// 1. Supprime les node_modules imbriqués de fork-ts-checker
const p = 'node_modules/fork-ts-checker-webpack-plugin/node_modules';
if (fs.existsSync(p)) {
  fs.rmSync(p, { recursive: true });
  console.log('✓ fork-ts-checker patched');
}

// 2. Remplace _formatLimit.js par un no-op (cause du crash ajv v8)
const f = 'node_modules/ajv-keywords/keywords/_formatLimit.js';
if (fs.existsSync(f)) {
  fs.writeFileSync(f, 'module.exports = function() { return function() {}; };\n');
  console.log('✓ ajv-keywords _formatLimit patched');
}