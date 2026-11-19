const day = () => Math.floor(Date.now() / 86400000);

export async function recordChartListen(db, uid, track) {
 await db.prepare('INSERT OR IGNORE INTO chart_listens (day,track,uid) VALUES (?,?,?)')
  .bind(day(), track, uid).run();
}

export async function readChart(db, ids) {
 if (!ids.size) return [];
 const {results} = await db.prepare(`
  WITH active(track) AS (SELECT value FROM json_each(?)),
  activity AS (
   SELECT track, COUNT(*) AS plays, 0 AS likes FROM chart_listens
    WHERE day>=? AND track IN active GROUP BY track
   UNION ALL
   SELECT track, 0, COUNT(*) FROM likes WHERE track IN active GROUP BY track
  )
  SELECT track AS id, SUM(plays) AS plays, SUM(likes) AS likes FROM activity
   GROUP BY track ORDER BY SUM(plays)+2*SUM(likes) DESC, SUM(plays) DESC, track ASC LIMIT 100
 `).bind(JSON.stringify([...ids]), day() - 29).all();
 return results;
}
