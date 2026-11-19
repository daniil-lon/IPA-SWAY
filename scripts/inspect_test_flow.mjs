import fs from 'fs';
const testCode = fs.readFileSync('scripts/check-new-ux-features.mjs', 'utf8');
const lines = testCode.split('\n');
console.log(lines.slice(45, 80).join('\n'));
