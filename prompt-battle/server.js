// Prompt Battle: kleiner Spielserver ohne externe Abhängigkeiten (Node.js 20 oder neuer).
// Start: node server.js   Einstellungen über Umgebungsvariablen, siehe README.md
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const game = require('./lib/game');
const judge = require('./lib/judge');

const PORT = Number(process.env.PORT) || 3000;
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = crypto.randomBytes(4).toString('hex');
  console.log('ADMIN_PASSWORD ist nicht gesetzt. Temporäres Moderator-Passwort für diesen Start: ' + ADMIN_PASSWORD);
}
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const PAGES = { '/': 'index.html', '/host': 'host.html', '/screen': 'screen.html' };

// ---------------------------------------------------------------- Hilfen
function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 200000) { reject(new game.GameError('Anfrage zu groß.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (_) { reject(new game.GameError('Ungültige Anfrage.')); } });
    req.on('error', reject);
  });
}

const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// einfache Bremse gegen Passwort-Raten und Überlastung
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const h = (hits.get(key) || []).filter((t) => now - t < windowMs);
  h.push(now);
  hits.set(key, h);
  return h.length > max;
}
setInterval(() => hits.clear(), 10 * 60 * 1000).unref();
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function hostRoom(body) {
  const room = game.getRoom(body.room);
  if (!body.token || !safeEqual(body.token, room.hostToken)) throw new game.GameError('Keine Moderator-Berechtigung für diesen Raum.');
  return room;
}

// ---------------------------------------------------------------- Live-Updates (Server-Sent Events)
function push(client, room) {
  try { client.res.write('data: ' + JSON.stringify(game.view(room, client)) + '\n\n'); } catch (_) { /* Verbindung weg */ }
}
game.setBroadcaster((room) => { for (const c of room.clients) push(c, room); });
setInterval(() => { for (const room of game.rooms.values()) for (const c of room.clients) { try { c.res.write(': ping\n\n'); } catch (_) {} } }, 20000).unref();

function events(req, res, q) {
  const room = game.getRoom(q.get('room'));
  const client = { res, role: 'screen', pid: null };
  if (q.get('token')) {
    if (!safeEqual(q.get('token'), room.hostToken)) throw new game.GameError('Keine Moderator-Berechtigung für diesen Raum.');
    client.role = 'host';
  } else if (q.get('pid')) {
    client.role = 'player';
    client.pid = q.get('pid');
    const p = room.players[client.pid];
    if (p && !safeEqual(q.get('key') || '', p.key)) throw new game.GameError('Du bist in diesem Raum nicht (mehr) angemeldet.');
  }
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.write('retry: 2000\n\n');
  room.clients.add(client);
  push(client, room);
  if (client.role === 'player') for (const c of room.clients) if (c !== client) push(c, room); // Online-Status
  req.on('close', () => { room.clients.delete(client); if (client.role === 'player') for (const c of room.clients) push(c, room); });
}

// ---------------------------------------------------------------- API
async function api(req, res, url) {
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/events') return events(req, res, url.searchParams);
  if (req.method === 'GET' && p === '/api/ping') return send(res, 200, { ok: true });
  if (req.method === 'GET' && p === '/api/info') return send(res, 200, { demo: judge.DEMO, figures: game.FIGURES, maxPrompt: game.MAX_PROMPT });
  if (req.method === 'GET' && p === '/api/room') { const room = game.getRoom(url.searchParams.get('room')); return send(res, 200, { code: room.code, phase: room.phase }); }
  if (req.method === 'GET' && p === '/api/export') {
    const room = hostRoom({ room: url.searchParams.get('room'), token: url.searchParams.get('token') });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-disposition': 'attachment; filename="prompt-battle-' + room.code + '.json"' });
    return res.end(JSON.stringify(game.exportRoom(room), null, 2));
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'Nicht gefunden.' });
  const body = await readBody(req);
  if (p === '/api/host/create') {
    if (limited('pw:' + ipOf(req), 8, 60000)) return send(res, 429, { error: 'Zu viele Versuche. Bitte kurz warten.' });
    if (!safeEqual(body.password || '', ADMIN_PASSWORD)) return send(res, 403, { error: 'Das Passwort stimmt nicht.' });
    const room = game.createRoom();
    return send(res, 200, { room: room.code, token: room.hostToken });
  }
  if (p === '/api/host/claim') { // Raum auf einem anderen Gerät weiter moderieren
    if (limited('pw:' + ipOf(req), 8, 60000)) return send(res, 429, { error: 'Zu viele Versuche. Bitte kurz warten.' });
    if (!safeEqual(body.password || '', ADMIN_PASSWORD)) return send(res, 403, { error: 'Das Passwort stimmt nicht.' });
    const room = game.getRoom(body.room);
    return send(res, 200, { room: room.code, token: room.hostToken });
  }
  if (p === '/api/host/check') { hostRoom(body); return send(res, 200, { ok: true }); }
  if (p === '/api/host/action') {
    const room = hostRoom(body);
    await game.hostAction(room, String(body.action || ''), body);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/join') {
    if (limited('join:' + ipOf(req), 60, 60000)) return send(res, 429, { error: 'Zu viele Versuche. Bitte kurz warten.' });
    const room = game.getRoom(body.room);
    const pl = game.join(room, body);
    return send(res, 200, { room: room.code, pid: pl.id, key: pl.key });
  }
  if (p === '/api/submit') {
    const room = game.getRoom(body.room);
    game.submit(room, body.pid, body.key, body.text);
    return send(res, 200, { ok: true });
  }
  return send(res, 404, { error: 'Nicht gefunden.' });
}

// ---------------------------------------------------------------- Dateien
function serveStatic(req, res, url) {
  let rel = PAGES[url.pathname] || decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    const ext = path.extname(file);
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': ['.html', '.js', '.css'].includes(ext) ? 'no-cache' : 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((e) => {
      if (res.headersSent) return res.end();
      if (e instanceof game.GameError) return send(res, 400, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'Interner Fehler.' });
    });
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, url);
  } else {
    res.writeHead(405); res.end();
  }
});

game.load();
server.listen(PORT, () => {
  console.log('Prompt Battle läuft auf Port ' + PORT);
  console.log(judge.DEMO ? 'DEMO-MODUS: Kein ANTHROPIC_API_KEY gesetzt, es wird ohne KI bewertet.' : 'Schiedsrichter: ' + judge.MODEL_JUDGE + ', Ausführung: ' + judge.MODEL_RUN);
});
