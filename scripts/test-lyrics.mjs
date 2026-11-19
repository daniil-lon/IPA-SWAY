import crypto from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function getOAuthToken() {
  const dir = join(process.env.APPDATA, 'YandexMusicMod', 'Local Storage', 'leveldb');
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir)) {
    if (!/\.(ldb|log)$/i.test(f)) continue;
    try {
      const content = readFileSync(join(dir, f), 'latin1');
      const m = content.match(/y0_[a-zA-Z0-9_-]{20,}/);
      if (m) return m[0];
    } catch {}
  }
  return null;
}

// 1. Try Musixmatch (using mod's key)
function signMxmUrl(url) {
  const secretKey = "967Pn4)N3&R_GBg5$b('";
  const now = new Date();
  const y = now.getFullYear().toString();
  const M = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const yMMdd = y[3] + M + d;
  const urlWithDate = url + yMMdd;
  const sign = crypto.createHmac('sha1', secretKey).update(urlWithDate).digest('base64');
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + 'signature=' + encodeURIComponent(sign) + '&signature_protocol=sha1';
}

export async function fetchMusixmatchLyrics(trackName, artistName) {
  try {
    const baseParams = new URLSearchParams({
      app_id: 'android-player-v1.0',
      country: 'ru',
      format: 'json',
      usertoken: '250721b994519ea801e6582aeb61c797d5cecb501ed93b6c22e42d',
      q_track: trackName,
      q_artist: artistName,
      tags: 'scrobbling,notifications',
      f_subtitle_length_max_deviation: '1',
      subtitle_format: 'dfxp',
      page_size: '1',
      optional_calls: 'track.richsync,crowd.track.actions',
      scrobbling_package: 'ru.yandex.music',
      language_iso_code: '1',
      part: 'lyrics_crowd,user,lyrics_vote,lyrics_poll,track_lyrics_translation_status,lyrics_verified_by,labels,track_structure'
    });

    const path = 'macro.subtitles.get?' + baseParams.toString();
    const fullUrl = 'https://apic.musixmatch.com/ws/1.1/' + signMxmUrl(path);

    const res = await fetch(fullUrl, {
      headers: {
        'Accept-Encoding': 'gzip',
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; ASUS_I005DA Build/PI)',
        'x-mxm-endpoint': 'default',
        'Cookie': 'x-mxm-token-guid=' + crypto.randomBytes(8).toString('hex')
      }
    });
    const data = await res.json();
    const calls = data?.message?.body?.macro_calls;
    const lyricsBody = calls?.['track.lyrics.get']?.message?.body?.lyrics?.lyrics_body;
    const subBody = calls?.['track.subtitles.get']?.message?.body?.subtitle?.subtitle_body;
    return { lyrics: lyricsBody || null, sub: subBody || null };
  } catch (e) {
    return { error: e.message };
  }
}

// 2. Try LRCLIB (free open synchronized and plain lyrics database)
export async function fetchLrclibLyrics(trackName, artistName, duration) {
  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName
    });
    if (duration) params.append('duration', Math.round(duration));
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      return {
        plainLyrics: data.plainLyrics || null,
        syncedLyrics: data.syncedLyrics || null
      };
    }
  } catch (e) {}
  return null;
}

// 3. Try Yandex Music API
export async function fetchYandexLyrics(trackId) {
  const token = getOAuthToken();
  const secret = 'kzqU4XhfCaY6B6JTHODeq5';
  const timeStamp = Math.floor(Date.now() / 1000);
  const data = trackId + timeStamp;
  const sign = crypto.createHmac('sha256', secret).update(data).digest('base64');
  const url = `https://api.music.yandex.net/tracks/${trackId}/lyrics?sign=${encodeURIComponent(sign)}&timeStamp=${timeStamp}&format=TEXT`;
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': 'OAuth ' + token,
        'User-Agent': 'YandexMusicDesktopAppWindows/5.86.0',
        'X-Yandex-Music-Client': 'YandexMusicDesktopAppWindows/5.86.0'
      }
    });
    const json = await res.json();
    if (json.result && json.result.downloadUrl) {
      const text = await (await fetch(json.result.downloadUrl)).text();
      if (!text.includes('Подключите подписку на Плюс')) {
        return text;
      }
    }
  } catch (e) {}
  return null;
}

async function run() {
  console.log('Testing Musixmatch:');
  const mxm = await fetchMusixmatchLyrics('ДИНАСТИЯ', 'VILLIAN');
  console.log('MXM:', mxm);

  console.log('Testing LRCLIB:');
  const lrc = await fetchLrclibLyrics('ДИНАСТИЯ', 'VILLIAN');
  console.log('LRCLIB:', lrc);
}

run();
