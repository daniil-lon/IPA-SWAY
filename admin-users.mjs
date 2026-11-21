import { json, readJSON } from './profile-store.mjs';
import { audit } from './admin-ops.mjs';

const num = value => Number(value) || 0;

export async function usersAdminRoute({ req, path, method, url, env, loadTracks }) {
  if (!path.startsWith('/api/admin/users') && path !== '/api/admin/moderation') return null;
  if (!env.DB) return json({ error: 'D1 недоступна' }, 503);

  if (path === '/api/admin/users' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    const like = '%' + q + '%';
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
    const where = q ? ' WHERE u.name LIKE ? OR u.id LIKE ? OR COALESCE(p.handle, \'\') LIKE ?' : '';
    const args = q ? [like, like, like] : [];

    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS c FROM users u LEFT JOIN user_profiles p ON p.uid = u.id' + where
    ).bind(...args).first();

    const { results = [] } = await env.DB.prepare(`
      SELECT u.id, u.name, u.wave_pattern,
             p.handle, p.visible, p.joined_at,
             (SELECT COUNT(*) FROM likes l WHERE l.uid = u.id) AS likes,
             (SELECT COUNT(*) FROM playlists pl WHERE pl.uid = u.id) AS playlists,
             (SELECT COALESCE(SUM(seconds), 0) FROM listening_daily d WHERE d.uid = u.id) AS seconds,
             (SELECT MAX(updated) FROM listening_daily d WHERE d.uid = u.id) AS last_listen,
             (SELECT COUNT(*) FROM sessions s WHERE s.uid = u.id AND s.expiry > unixepoch()) AS sessions
      FROM users u LEFT JOIN user_profiles p ON p.uid = u.id
      ${where}
      ORDER BY COALESCE(last_listen, p.joined_at, 0) DESC
      LIMIT ? OFFSET ?
    `).bind(...args, limit, offset).all();

    return json({
      total: num(count?.c),
      offset,
      limit,
      items: results.map(row => ({
        id: row.id,
        name: row.name,
        handle: row.handle || '',
        visible: Boolean(row.visible),
        joinedAt: row.joined_at,
        likes: num(row.likes),
        playlists: num(row.playlists),
        seconds: Math.round(num(row.seconds)),
        lastListen: row.last_listen || null,
        sessions: num(row.sessions)
      }))
    });
  }

  if (path === '/api/admin/users/detail' && method === 'GET') {
    const id = url.searchParams.get('id');
    if (!id) return json({ error: 'id обязателен' }, 400);
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!user) return json({ error: 'not_found' }, 404);

    const all = async (sql, ...args) => {
      try { return (await env.DB.prepare(sql).bind(...args).all()).results || []; } catch { return []; }
    };
    const [profile, likes, playlists, top, sessions, subscription] = await Promise.all([
      env.DB.prepare('SELECT uid, handle, bio, visible, joined_at, cover_zoom, avatar IS NOT NULL AS has_avatar, cover IS NOT NULL AS has_cover FROM user_profiles WHERE uid = ?').bind(id).first(),
      all('SELECT track, added FROM likes WHERE uid = ? ORDER BY added DESC LIMIT 100', id),
      all('SELECT p.id, p.name, p.updated, (SELECT COUNT(*) FROM playlist_tracks t WHERE t.playlist = p.id) AS tracks FROM playlists p WHERE p.uid = ? ORDER BY p.updated DESC', id),
      all('SELECT track, SUM(seconds) AS seconds, SUM(plays) AS plays FROM listening_daily WHERE uid = ? GROUP BY track ORDER BY seconds DESC LIMIT 10', id),
      all('SELECT created_at, expiry FROM sessions WHERE uid = ? AND expiry > unixepoch() ORDER BY created_at DESC', id),
      env.DB.prepare('SELECT plan, status, starts_at, ends_at FROM subscriptions WHERE uid = ? ORDER BY created_at DESC LIMIT 1').bind(id).first()
    ]);

    const tracks = await loadTracks().catch(() => []);
    const byId = new Map(tracks.map(track => [track.id, track]));
    const decorate = row => ({ id: row.track, title: byId.get(row.track)?.title || row.track, artist: byId.get(row.track)?.artist || '', art: byId.get(row.track)?.art || '' });

    return json({
      user: {
        id: user.id,
        name: user.name,
        volume: user.volume,
        autoplay: Boolean(user.autoplay),
        motion: Boolean(user.motion),
        crossfade: Boolean(user.crossfade),
        wavePattern: user.wave_pattern
      },
      profile: profile || null,
      likes: likes.map(row => ({ ...decorate(row), added: row.added })),
      playlists,
      top: top.map(row => ({ ...decorate(row), seconds: Math.round(num(row.seconds)), plays: num(row.plays) })),
      sessions,
      subscription: subscription || null
    });
  }

  if (path === '/api/admin/users/action' && method === 'POST') {
    const body = await readJSON(req, 30000);
    const id = String(body?.id || '');
    const action = String(body?.action || '');
    if (!id) return json({ error: 'id обязателен' }, 400);
    const exists = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (!exists) return json({ error: 'not_found' }, 404);

    if (action === 'logout') {
      await env.DB.prepare('DELETE FROM sessions WHERE uid = ?').bind(id).run();
    } else if (action === 'hide' || action === 'show') {
      await env.DB.prepare('INSERT INTO user_profiles (uid, visible) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET visible = excluded.visible').bind(id, action === 'show' ? 1 : 0).run();
    } else if (action === 'rename') {
      const name = String(body.value || '').trim();
      if (!name || name.length > 80) return json({ error: 'invalid_name' }, 400);
      await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, id).run();
    } else if (action === 'clearLikes') {
      await env.DB.prepare('DELETE FROM likes WHERE uid = ?').bind(id).run();
    } else if (action === 'grant') {
      const plan = String(body.value || 'manual').slice(0, 40);
      const days = Math.min(Math.max(Number(body.days) || 30, 1), 3650);
      await env.DB.prepare("INSERT INTO subscriptions (uid, plan, status, starts_at, ends_at) VALUES (?, ?, 'active', unixepoch(), unixepoch() + ?)").bind(id, plan, days * 86400).run();
    } else if (action === 'delete') {
      const statements = [
        'DELETE FROM playlist_tracks WHERE playlist IN (SELECT id FROM playlists WHERE uid = ?)',
        'DELETE FROM playlist_invites WHERE playlist IN (SELECT id FROM playlists WHERE uid = ?)',
        'DELETE FROM playlist_members WHERE uid = ? OR playlist IN (SELECT id FROM playlists WHERE uid = ?)',
        'DELETE FROM playlists WHERE uid = ?',
        'DELETE FROM likes WHERE uid = ?',
        'DELETE FROM sessions WHERE uid = ?',
        'DELETE FROM playback_state WHERE uid = ?',
        'DELETE FROM listening_events WHERE uid = ?',
        'DELETE FROM listening_daily WHERE uid = ?',
        'DELETE FROM history_cutoffs WHERE uid = ?',
        'DELETE FROM chart_listens WHERE uid = ?',
        'DELETE FROM user_taste WHERE uid = ?',
        'DELETE FROM collection_reactions WHERE uid = ?',
        'DELETE FROM subscriptions WHERE uid = ?',
        'DELETE FROM user_profiles WHERE uid = ?',
        'DELETE FROM users WHERE id = ?'
      ];
      const batch = [];
      for (const sql of statements) {
        const count = (sql.match(/\?/g) || []).length;
        batch.push(env.DB.prepare(sql).bind(...Array(count).fill(id)));
      }
      await env.DB.batch(batch);
    } else {
      return json({ error: 'unknown_action' }, 400);
    }

    await audit(env, 'user.' + action, id, body.value ? String(body.value).slice(0, 120) : '');
    return json({ ok: true });
  }

  if (path === '/api/admin/moderation' && method === 'GET') {
    const all = async (sql, ...args) => {
      try { return (await env.DB.prepare(sql).bind(...args).all()).results || []; } catch { return []; }
    };
    const [visible, reactions, invites] = await Promise.all([
      all('SELECT p.uid, p.handle, p.bio, p.joined_at, u.name FROM user_profiles p JOIN users u ON u.id = p.uid WHERE p.visible = 1 ORDER BY p.joined_at DESC LIMIT 50'),
      all('SELECT kind, ref, COUNT(*) AS total FROM collection_reactions GROUP BY kind, ref ORDER BY total DESC LIMIT 40'),
      all('SELECT playlist, role, expiry FROM playlist_invites ORDER BY created DESC LIMIT 30')
    ]);
    return json({ visible, reactions, invites });
  }

  return json({ error: 'not_found' }, 404);
}
