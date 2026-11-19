import { execSync } from 'child_process';

try {
  const out = execSync('npx wrangler d1 execute tonika-music --remote --command "SELECT id, title, artist, lines, plain FROM track_lyrics WHERE plain LIKE \'%обратил на меня%\' LIMIT 1"', {
    encoding: 'utf8',
    env: { ...process.env, HTTPS_PROXY: 'http://127.0.0.1:2080', HTTP_PROXY: 'http://127.0.0.1:2080' }
  });
  console.log(out);
} catch (e) {
  console.error(e.stdout || e.message);
}
