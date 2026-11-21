import fs from 'fs';
import { execSync } from 'child_process';

let code = fs.readFileSync('public/app.js', 'utf8');

// Replace the line after fullArtwork if it is just "};"
const lines = code.split(/\r?\n/);
let found = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('const fullArtwork=') && lines[i+1]?.trim() === '};') {
    found = i + 1;
    break;
  }
}

if (found !== -1) {
  console.log('Found stray }; at line', found + 1);
  lines.splice(found, 1);
  code = lines.join('\n');
  fs.writeFileSync('public/app.js', code, 'utf8');
  console.log('Removed stray }; successfully');
} else {
  console.log('Could not find stray };');
}

fs.copyFileSync('public/app.js', 'temp_app.mjs');
try {
  execSync('node --check temp_app.mjs');
  console.log('public/app.js syntax is 100% VALID!');
} catch (e) {
  console.error(e.stderr.toString());
} finally {
  fs.unlinkSync('temp_app.mjs');
}
