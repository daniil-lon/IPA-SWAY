import fs from 'fs';
const w = fs.readFileSync('worker.mjs', 'utf8');
const lines = w.split('\n');
console.log(lines.slice(115, 155).join('\n'));
