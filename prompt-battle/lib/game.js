// Spiellogik: Räume, Spieler, Runden, Auslosung, Punkte.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DEFAULT_CASES } = require('./cases');
const judge = require('./judge');

const FIGURES = ['promptling', 'kontextor', 'halluzino', 'rollux'];
const BOT = 'bot';
const BOT_NAME = 'Halluzino (Hausgegner)';
const MAX_PROMPT = 2000;
const MAX_PLAYERS = 40;
const MAX_ROOMS = 30;
const ROOM_TTL = 36 * 3600 * 1000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const rooms = new Map();
const rid = (n = 8) => crypto.randomBytes(n).toString('hex');
const clone = (x) => JSON.parse(JSON.stringify(x));
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

class GameError extends Error {}
const fail = (msg) => { throw new GameError(msg); };

// ---------------------------------------------------------------- Räume
function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += abc[crypto.randomInt(abc.length)];
    if (!rooms.has(c)) return c;
  }
}

function createRoom() {
  cleanup();
  if (rooms.size >= MAX_ROOMS) fail('Zu viele offene Räume. Bitte später erneut versuchen.');
  const room = {
    code: newCode(), hostToken: rid(16), createdAt: Date.now(),
    phase: 'lobby', roundIndex: -1,
    settings: { rounds: 6, seconds: 240 },
    cases: clone(DEFAULT_CASES),
    players: {}, rounds: [], met: {}, botGames: {}, adjust: {},
    deadline: null, reveal: 0, progress: null
  };
  attach(room);
  rooms.set(room.code, room);
  save();
  return room;
}

function attach(room) {
  Object.defineProperty(room, 'clients', { value: new Set(), enumerable: false });
  Object.defineProperty(room, 'timer', { value: null, enumerable: false, writable: true });
  Object.defineProperty(room, 'busy', { value: false, enumerable: false, writable: true });
}

function getRoom(code) {
  const room = rooms.get(String(code || '').trim().toUpperCase());
  if (!room) fail('Diesen Raum gibt es nicht (mehr). Bitte den Code prüfen.');
  return room;
}

function cleanup() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL) {
      clearTimeout(room.timer);
      for (const c of room.clients) try { c.res.end(); } catch (_) {}
      rooms.delete(code);
    }
  }
}

// ---------------------------------------------------------------- Speichern (übersteht einen Neustart des Prozesses)
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATE_FILE + '.tmp', JSON.stringify([...rooms.values()]));
      fs.renameSync(STATE_FILE + '.tmp', STATE_FILE);
    } catch (e) { console.error('Speichern fehlgeschlagen:', e.message); }
  }, 400);
}

function load() {
  try {
    const list = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    for (const room of list) {
      attach(room);
      if (room.phase === 'judging') { // Bewertung wurde durch Neustart unterbrochen
        room.phase = 'writing'; room.deadline = null; room.progress = null;
        const r = room.rounds[room.roundIndex]; if (r) { r.matches = []; r.best = null; }
      }
      rooms.set(room.code, room);
      armTimer(room);
    }
    cleanup();
    if (rooms.size) console.log('Spielstand geladen:', [...rooms.keys()].join(', '));
  } catch (_) { /* kein gespeicherter Stand */ }
}

// ---------------------------------------------------------------- Live-Updates
let onChange = () => {};
function setBroadcaster(fn) { onChange = fn; }
function changed(room) { recompute(room); save(); onChange(room); }

// ---------------------------------------------------------------- Spieler
function join(room, { name, figure, pid, key }) {
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (!name) fail('Bitte gib deiner Figur einen Namen.');
  if (!FIGURES.includes(figure)) fail('Bitte wähle eine Figur.');
  let p = pid && room.players[pid];
  if (p && p.key === key) { p.name = name; p.figure = figure; changed(room); return p; }
  if (room.phase === 'final') fail('Dieses Spiel ist schon beendet.');
  if (Object.keys(room.players).length >= MAX_PLAYERS) fail('Der Raum ist voll.');
  p = { id: rid(6), key: rid(12), name, figure, joinedAt: Date.now(), score: 0, wins: 0, bonus: 0 };
  room.players[p.id] = p;
  changed(room);
  return p;
}

function auth(room, pid, key) {
  const p = room.players[pid];
  if (!p || p.key !== key) fail('Du bist in diesem Raum nicht (mehr) angemeldet.');
  return p;
}

function submit(room, pid, key, text) {
  const p = auth(room, pid, key);
  if (room.phase !== 'writing') fail('Die Runde ist schon geschlossen.');
  text = String(text || '').replace(/\r/g, '').trim().slice(0, MAX_PROMPT);
  const r = room.rounds[room.roundIndex];
  if (text) r.submissions[p.id] = text; else delete r.submissions[p.id];
  changed(room);
}

// ---------------------------------------------------------------- Punkte (werden immer komplett neu berechnet)
function recompute(room) {
  const P = room.players;
  for (const p of Object.values(P)) { p.score = 0; p.wins = 0; p.bonus = 0; p.quality = 0; }
  room.rounds.forEach((r, i) => {
    const current = i === room.roundIndex;
    const allOpen = !current || ['best', 'board', 'final'].includes(room.phase);
    r.matches.forEach((m, j) => {
      const open = allOpen || (room.phase === 'reveal' && j < room.reveal);
      if (!open || !m.verdict) return;
      for (const side of ['a', 'b']) {
        const p = P[m[side]];
        if (!p) continue;
        p.quality += side === 'a' ? m.verdict.scoreA || 0 : m.verdict.scoreB || 0;
        if (m.verdict.winner === side) { p.wins++; p.score++; }
      }
    });
    if (r.best && allOpen && P[r.best.pid]) { P[r.best.pid].bonus++; P[r.best.pid].score++; }
  });
  for (const [pid, d] of Object.entries(room.adjust)) if (P[pid]) P[pid].score += d;
}

function ranking(room) {
  return Object.values(room.players).slice().sort((x, y) => y.score - x.score || y.bonus - x.bonus || y.quality - x.quality || x.joinedAt - y.joinedAt);
}

// ---------------------------------------------------------------- Auslosung
// Zufällig, aber mit möglichst wenigen Wiederholungen früherer Begegnungen.
function makePairs(room, pids) {
  let rest = shuffle(pids);
  const pairs = [];
  if (rest.length % 2 === 1) {
    const min = Math.min(...rest.map((p) => room.botGames[p] || 0));
    const cand = rest.filter((p) => (room.botGames[p] || 0) === min);
    const lonely = cand[crypto.randomInt(cand.length)];
    rest = rest.filter((p) => p !== lonely);
    pairs.push([lonely, BOT]);
  }
  let best = null, bestCost = Infinity;
  for (let t = 0; t < 3000 && bestCost > 0; t++) {
    const s = shuffle(rest);
    let cost = 0;
    const ps = [];
    for (let i = 0; i < s.length; i += 2) { ps.push([s[i], s[i + 1]]); cost += room.met[pairKey(s[i], s[i + 1])] || 0; }
    if (cost < bestCost) { bestCost = cost; best = ps; }
  }
  return shuffle(pairs.concat(best || []));
}

// ---------------------------------------------------------------- Rundenablauf
function armTimer(room) {
  clearTimeout(room.timer);
  if (room.phase === 'writing' && room.deadline) {
    room.timer = setTimeout(() => { if (room.phase === 'writing') closeRound(room).catch((e) => console.error(e)); }, Math.max(0, room.deadline - Date.now()) + 300);
  }
}

function startRound(room) {
  if (!['lobby', 'board'].includes(room.phase)) fail('Jetzt kann keine Runde gestartet werden.');
  if (Object.keys(room.players).length < 1) fail('Es ist noch niemand im Raum.');
  if (room.roundIndex + 1 >= room.settings.rounds) { room.phase = 'final'; changed(room); return; }
  room.roundIndex++;
  const c = clone(room.cases[room.roundIndex % room.cases.length]);
  room.rounds[room.roundIndex] = { index: room.roundIndex, case: c, submissions: {}, matches: [], best: null };
  room.phase = 'writing';
  room.reveal = 0;
  room.deadline = Date.now() + room.settings.seconds * 1000;
  armTimer(room);
  changed(room);
}

async function pool(tasks, limit) {
  let i = 0;
  const worker = async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

const botPrompt = (c) => 'Schreib mal was zu: ' + c.titel;
const snap = (room, pid) => (pid === BOT ? { name: BOT_NAME, figure: 'halluzino' } : { name: room.players[pid].name, figure: room.players[pid].figure });

async function evaluate(room, r, m) {
  // 1. beide Prompts ausführen  2. Schiedsrichter fragen (Reihenfolge A/B zufällig, gegen Positionsvorteile)
  m.error = null;
  const [oa, ob] = await Promise.all([judge.runPrompt(r.case, m.promptA), judge.runPrompt(r.case, m.promptB)]);
  m.outA = oa; m.outB = ob;
  const swap = crypto.randomInt(2) === 1;
  const v = swap ? await judge.judgeMatch(r.case, m.promptB, ob, m.promptA, oa) : await judge.judgeMatch(r.case, m.promptA, oa, m.promptB, ob);
  const sw = (t) => String(t || '').replace(/\b(Prompt|Antwort) A\b/g, '$1 §').replace(/\b(Prompt|Antwort) B\b/g, '$1 A').replace(/\b(Prompt|Antwort) §/g, '$1 B');
  m.verdict = swap
    ? { winner: v.winner === 'A' ? 'b' : 'a', scoreA: v.scoreB, scoreB: v.scoreA, reason: sw(v.reason), strengthA: sw(v.strengthB), strengthB: sw(v.strengthA), tipA: sw(v.tipB), tipB: sw(v.tipA), cheatA: v.cheatB, cheatB: v.cheatA }
    : { winner: v.winner === 'A' ? 'a' : 'b', scoreA: v.scoreA, scoreB: v.scoreB, reason: v.reason, strengthA: v.strengthA, strengthB: v.strengthB, tipA: v.tipA, tipB: v.tipB, cheatA: v.cheatA, cheatB: v.cheatB };
}

function walkover(m) {
  const hasA = !!m.promptA, hasB = !!m.promptB;
  if (hasA && hasB) return false;
  m.walkover = true;
  m.verdict = {
    winner: hasA ? 'a' : hasB ? 'b' : null, scoreA: hasA ? 50 : 0, scoreB: hasB ? 50 : 0,
    reason: hasA || hasB ? 'Kampfloser Sieg: Die Gegenseite hat keinen Prompt abgegeben.' : 'Kein Sieger: Beide Seiten haben keinen Prompt abgegeben.',
    strengthA: '', strengthB: '', tipA: '', tipB: '', cheatA: false, cheatB: false
  };
  return true;
}

async function chooseBest(room, r) {
  // Kandidaten: alle abgegebenen Prompts von Teilnehmern, die besten vier nach Punkten gehen in den Vergleich
  const cands = [];
  for (const m of r.matches) {
    if (!m.verdict) continue;
    for (const side of ['a', 'b']) {
      const pid = m[side];
      const prompt = side === 'a' ? m.promptA : m.promptB;
      if (pid === BOT || !prompt || !room.players[pid]) continue;
      if (side === 'a' ? m.verdict.cheatA : m.verdict.cheatB) continue;
      cands.push({ pid, prompt, output: (side === 'a' ? m.outA : m.outB) || '', score: (side === 'a' ? m.verdict.scoreA : m.verdict.scoreB) + (m.verdict.winner === side ? 5 : 0) });
    }
  }
  if (!cands.length) { r.best = null; return; }
  cands.sort((x, y) => y.score - x.score);
  const top = cands.slice(0, 4);
  let pick;
  try { pick = await judge.pickBest(r.case, top); } catch (e) { pick = { index: 0, reason: 'Höchste Punktzahl der Runde.', learn: '' }; r.bestError = e.message; }
  const w = top[pick.index];
  r.best = { pid: w.pid, name: room.players[w.pid].name, figure: room.players[w.pid].figure, prompt: w.prompt, output: w.output, reason: pick.reason, learn: pick.learn };
}

async function closeRound(room) {
  if (room.phase !== 'writing' || room.busy) return;
  room.busy = true;
  clearTimeout(room.timer);
  const r = room.rounds[room.roundIndex];
  try {
    room.phase = 'judging';
    room.deadline = null;
    const pairs = makePairs(room, Object.keys(room.players));
    r.matches = pairs.map(([a, b]) => {
      if (b !== BOT) room.met[pairKey(a, b)] = (room.met[pairKey(a, b)] || 0) + 1; else room.botGames[a] = (room.botGames[a] || 0) + 1;
      const sa = snap(room, a), sb = snap(room, b);
      return { id: rid(4), a, b, aName: sa.name, aFigure: sa.figure, bName: sb.name, bFigure: sb.figure,
        promptA: r.submissions[a] || '', promptB: b === BOT ? botPrompt(r.case) : r.submissions[b] || '',
        outA: '', outB: '', verdict: null, error: null, walkover: false, manual: false };
    });
    const todo = r.matches.filter((m) => !walkover(m));
    room.progress = { done: 0, total: todo.length + 1 };
    changed(room);
    await pool(todo.map((m) => async () => {
      try { await evaluate(room, r, m); } catch (e) { m.error = e.message || String(e); console.error('Bewertung fehlgeschlagen:', m.error); }
      room.progress.done++;
      onChange(room);
    }), 5);
    await chooseBest(room, r);
  } catch (e) {
    console.error('Fehler beim Schließen der Runde:', e);
  } finally {
    room.busy = false;
    room.progress = null;
    room.phase = 'reveal';
    room.reveal = 0;
    changed(room);
  }
}

// ---------------------------------------------------------------- Moderator-Aktionen
async function hostAction(room, action, body) {
  const r = room.rounds[room.roundIndex];
  switch (action) {
    case 'settings': {
      if (room.phase !== 'lobby') fail('Einstellungen lassen sich nur in der Lobby ändern.');
      const rounds = Math.round(Number(body.rounds)), seconds = Math.round(Number(body.seconds));
      if (rounds >= 1 && rounds <= 12) room.settings.rounds = rounds;
      if (seconds >= 30 && seconds <= 1800) room.settings.seconds = seconds;
      break;
    }
    case 'cases': {
      if (!Array.isArray(body.cases) || !body.cases.length) fail('Mindestens ein Case wird gebraucht.');
      const cs = body.cases.slice(0, 12).map((c) => ({
        titel: String(c.titel || '').trim().slice(0, 80), aufgabe: String(c.aufgabe || '').trim().slice(0, 1200),
        material: String(c.material || '').trim().slice(0, 3000), kriterien: String(c.kriterien || '').trim().slice(0, 800)
      })).filter((c) => c.titel && c.aufgabe);
      if (!cs.length) fail('Jeder Case braucht einen Titel und eine Aufgabe.');
      room.cases = cs;
      break;
    }
    case 'start': startRound(room); return;
    case 'addTime': if (room.phase === 'writing') { room.deadline = Math.max(room.deadline || Date.now(), Date.now()) + 60000; armTimer(room); } break;
    case 'close': if (room.phase !== 'writing') fail('Es läuft gerade keine Schreibphase.'); closeRound(room).catch((e) => console.error(e)); return;
    case 'revealNext': if (room.phase === 'reveal') room.reveal = Math.min(r.matches.length, room.reveal + 1); break;
    case 'revealAll': if (room.phase === 'reveal') room.reveal = r.matches.length; break;
    case 'best': if (room.phase === 'reveal') { room.reveal = r.matches.length; room.phase = r.best ? 'best' : 'board'; } break;
    case 'board': if (['reveal', 'best'].includes(room.phase)) { room.reveal = r.matches.length; room.phase = 'board'; } break;
    case 'final': if (room.phase === 'board') room.phase = 'final'; break;
    case 'override': {
      const m = r && r.matches.find((x) => x.id === body.matchId);
      if (!m || !['a', 'b'].includes(body.winner)) fail('Ungültige Korrektur.');
      m.verdict = m.verdict || { scoreA: 50, scoreB: 50, strengthA: '', strengthB: '', tipA: '', tipB: '', cheatA: false, cheatB: false };
      m.verdict.winner = body.winner;
      m.verdict.reason = 'Entscheidung des Moderators.' + (m.manual || !m.verdict.reason ? '' : ' Ursprüngliche Begründung: ' + m.verdict.reason);
      m.manual = true; m.error = null;
      break;
    }
    case 'rejudge': {
      const m = r && r.matches.find((x) => x.id === body.matchId);
      if (!m || m.walkover) fail('Dieses Duell kann nicht neu bewertet werden.');
      try { await evaluate(room, r, m); m.manual = false; } catch (e) { m.error = e.message || String(e); }
      break;
    }
    case 'adjust': {
      if (!room.players[body.pid]) fail('Unbekannter Teilnehmer.');
      const d = Math.round(Number(body.delta));
      if (d === 1 || d === -1) room.adjust[body.pid] = (room.adjust[body.pid] || 0) + d;
      break;
    }
    case 'kick': {
      if (!room.players[body.pid]) fail('Unbekannter Teilnehmer.');
      delete room.players[body.pid];
      if (r && room.phase === 'writing') delete r.submissions[body.pid];
      break;
    }
    default: fail('Unbekannte Aktion.');
  }
  changed(room);
}

// ---------------------------------------------------------------- Sichten (wer sieht was)
const PHASES_OPEN = ['best', 'board', 'final'];

function matchView(room, m, j, level) {
  // level: 'public' (Kurzfassung), 'full' (alle Texte)
  const open = PHASES_OPEN.includes(room.phase) || (room.phase === 'reveal' && j < room.reveal);
  const v = {
    id: m.id, open,
    a: { pid: m.a, name: m.aName, figure: m.aFigure, bot: m.a === BOT },
    b: { pid: m.b, name: m.bName, figure: m.bFigure, bot: m.b === BOT }
  };
  if (!open && level !== 'host') return v;
  const vd = m.verdict;
  Object.assign(v, {
    winner: vd ? vd.winner : null, reason: vd ? vd.reason : '', scoreA: vd ? vd.scoreA : 0, scoreB: vd ? vd.scoreB : 0,
    cheatA: !!(vd && vd.cheatA), cheatB: !!(vd && vd.cheatB), walkover: m.walkover, manual: m.manual, error: level === 'host' ? m.error : (m.error ? 'Bewertung fehlgeschlagen' : null)
  });
  if (level === 'full' || level === 'host') {
    Object.assign(v, { promptA: m.promptA, promptB: m.promptB, outA: m.outA, outB: m.outB,
      strengthA: vd ? vd.strengthA : '', strengthB: vd ? vd.strengthB : '', tipA: vd ? vd.tipA : '', tipB: vd ? vd.tipB : '' });
  }
  return v;
}

function view(room, client) {
  const r = room.rounds[room.roundIndex];
  const isHost = client.role === 'host';
  const me = client.role === 'player' ? room.players[client.pid] : null;
  const rank = ranking(room);
  const state = {
    code: room.code, phase: room.phase, round: room.roundIndex + 1, rounds: room.settings.rounds, seconds: room.settings.seconds,
    now: Date.now(), deadline: room.deadline, reveal: room.reveal, progress: room.progress, demo: judge.DEMO,
    players: rank.map((p) => ({ id: p.id, name: p.name, figure: p.figure, score: p.score, wins: p.wins, bonus: p.bonus, quality: p.quality,
      submitted: !!(r && room.phase === 'writing' && r.submissions[p.id]), online: [...room.clients].some((c) => c.pid === p.id) })),
    case: r && room.phase !== 'lobby' && room.phase !== 'final' ? { titel: r.case.titel, aufgabe: r.case.aufgabe, material: r.case.material } : null,
    matches: [], best: null, role: client.role
  };
  if (r && ['reveal', 'best', 'board'].includes(room.phase)) {
    state.matches = r.matches.map((m, j) => matchView(room, m, j, isHost ? 'host' : me && (m.a === me.id || m.b === me.id) ? 'full' : 'public'));
    if (PHASES_OPEN.includes(room.phase) && r.best) state.best = r.best;
  }
  if (me) {
    const same = (x, y) => x.score === y.score && x.bonus === y.bonus && x.quality === y.quality;
    state.me = { id: me.id, name: me.name, figure: me.figure, score: me.score, rank: rank.findIndex((p) => same(p, me)) + 1 };
    state.myPrompt = r && r.submissions[me.id] ? r.submissions[me.id] : '';
  } else if (client.role === 'player') {
    state.gone = true; // wurde entfernt
  }
  if (isHost) {
    state.cases = room.cases;
    state.models = { run: judge.MODEL_RUN, judge: judge.MODEL_JUDGE };
    state.history = room.rounds.map((x) => ({ titel: x.case.titel, best: x.best ? x.best.name : null }));
  }
  return state;
}

function exportRoom(room) {
  return {
    code: room.code, erstellt: new Date(room.createdAt).toISOString(),
    rangliste: ranking(room).map((p, i) => ({ platz: i + 1, name: p.name, figur: p.figure, punkte: p.score, siege: p.wins, bonus: p.bonus, wertung: p.quality })),
    runden: room.rounds.map((r) => ({
      runde: r.index + 1, case: r.case.titel,
      besterPrompt: r.best ? { name: r.best.name, prompt: r.best.prompt, begruendung: r.best.reason, lernpunkt: r.best.learn } : null,
      duelle: r.matches.map((m) => ({ a: m.aName, b: m.bName, promptA: m.promptA, promptB: m.promptB, antwortA: m.outA, antwortB: m.outB,
        sieger: m.verdict && m.verdict.winner ? (m.verdict.winner === 'a' ? m.aName : m.bName) : null, begruendung: m.verdict ? m.verdict.reason : '', fehler: m.error }))
    }))
  };
}

module.exports = { rooms, createRoom, getRoom, cleanup, join, auth, submit, hostAction, view, exportRoom, setBroadcaster, load, GameError, FIGURES, MAX_PROMPT };
