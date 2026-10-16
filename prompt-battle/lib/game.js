// Spiellogik: Räume, Spieler, Runden, Auslosung, Punkte.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DEFAULT_CASES } = require('./cases');
const judge = require('./judge');
const rubrik = require('./rubrik');
const { FIGURE_IDS, labelOf, displayName } = require('./figures');
const { BAUSTEINE, QUALITAETSCHECK, KEYS, byKey, ALLE } = require('./bausteine');

const FIGURES = FIGURE_IDS;
let reportOk = false;
try { reportOk = require('./report').available(); } catch (_) { /* Bericht nicht verfügbar */ }
const BOT = 'bot';
const BOT_NAME = 'Hausgegner';
const BOT_FIGURE = 'halluzino';
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
    settings: { rounds: Math.min(12, DEFAULT_CASES.length), seconds: 240 },
    cases: clone(DEFAULT_CASES),
    players: {}, rounds: [], met: {}, botGames: {}, adjust: {},
    deadline: null, reveal: 0, progress: null, judging: false
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
      if (room.phase === 'judging' || room.judging) { // Bewertung wurde durch Neustart unterbrochen
        room.phase = 'writing'; room.deadline = null; room.progress = null; room.judging = false;
        const r = room.rounds[room.roundIndex]; if (r) { r.matches = []; r.best = null; r.lesson = null; r.lessonShown = false; r.revealed = false; }
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
  if (!name) fail('Bitte gib deinen Namen ein.');
  if (!FIGURES.includes(figure)) fail('Bitte wähle eine Kreatur.');
  let p = pid && room.players[pid];
  const doppelt = Object.values(room.players).some((x) => x !== p && x.figure === figure && x.name.toLowerCase() === name.toLowerCase());
  if (doppelt) fail('"' + displayName(name, figure) + '" gibt es in diesem Raum schon. Wähle eine andere Kreatur oder ergänze deinen Namen.');
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

// Entwürfe werden automatisch gespeichert und zählen beim Schließen der Runde. "Fertig" ist ein Prompt erst,
// wenn der Teilnehmer auf "Abschicken" gedrückt hat (final). Eine spätere Änderung macht ihn wieder zum Entwurf.
function submit(room, pid, key, text, final) {
  const p = auth(room, pid, key);
  if (room.phase !== 'writing') fail('Die Runde ist schon geschlossen.');
  text = String(text || '').replace(/\r/g, '').trim().slice(0, MAX_PROMPT);
  const r = room.rounds[room.roundIndex];
  r.done = r.done || {};
  if (text) r.submissions[p.id] = text; else delete r.submissions[p.id];
  if (text && final) r.done[p.id] = true; else delete r.done[p.id];
  changed(room);
}

// Sind in der laufenden Runde alle Duelle aufgedeckt? Die Erklärung des Bausteins kommt jetzt VOR den Duellen
// (während im Hintergrund bewertet wird), deshalb zählt die Phase "lesson" nur, wenn schon aufgedeckt wurde.
const allesOffen = (room, r) => ['best', 'board', 'final'].includes(room.phase) || (room.phase === 'lesson' && !!(r && r.revealed));

// ---------------------------------------------------------------- Punkte (werden immer komplett neu berechnet)
function recompute(room) {
  const P = room.players;
  for (const p of Object.values(P)) { p.score = 0; p.wins = 0; p.bonus = 0; p.quality = 0; }
  room.rounds.forEach((r, i) => {
    const current = i === room.roundIndex;
    const allOpen = !current || allesOffen(room, r);
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

const caseSeconds = (room, c) => (c && c.minuten >= 0.5 && c.minuten <= 30 ? Math.round(c.minuten * 60) : room.settings.seconds);

function startRound(room) {
  if (!['lobby', 'board'].includes(room.phase)) fail('Jetzt kann keine Runde gestartet werden.');
  if (Object.keys(room.players).length < 1) fail('Es ist noch niemand im Raum.');
  if (room.roundIndex + 1 >= room.settings.rounds) { room.phase = 'final'; changed(room); return; }
  room.roundIndex++;
  const c = clone(room.cases[room.roundIndex % room.cases.length]);
  // Der Baukasten wächst mit: bekannt sind die Bausteine aller bisherigen Runden und der dieser Runde
  c.bekannt = rubrik.bekanntBis(room.rounds.slice(0, room.roundIndex).map((x) => x.case).concat([c]));
  room.rounds[room.roundIndex] = { index: room.roundIndex, case: c, submissions: {}, done: {}, matches: [], best: null };
  room.phase = 'writing';
  room.reveal = 0;
  room.deadline = Date.now() + caseSeconds(room, c) * 1000;
  armTimer(room);
  changed(room);
}

async function pool(tasks, limit) {
  let i = 0;
  const worker = async () => { while (i < tasks.length) { const t = tasks[i++]; await t(); } };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

const botPrompt = (c) => 'Schreib mal was zu: ' + c.titel;
const snap = (room, pid) => (pid === BOT ? { name: BOT_NAME, figure: BOT_FIGURE } : { name: room.players[pid].name, figure: room.players[pid].figure });

async function evaluate(room, r, m) {
  // 1. beide Prompts ausführen  2. Schiedsrichter fragen (Reihenfolge A/B zufällig, gegen Positionsvorteile)
  m.error = null; m.fallback = false;
  const swap = !judge.DEMO && crypto.randomInt(2) === 1; // nur die KI braucht den Schutz gegen Positionsvorteile
  let v;
  try {
    const [oa, ob] = await Promise.all([judge.runPrompt(r.case, m.promptA), judge.runPrompt(r.case, m.promptB)]);
    m.outA = oa; m.outB = ob;
    v = swap ? await judge.judgeMatch(r.case, m.promptB, ob, m.promptA, oa) : await judge.judgeMatch(r.case, m.promptA, oa, m.promptB, ob);
  } catch (e) {
    // KI nicht erreichbar: Das Spiel läuft mit der Standardbewertung weiter.
    console.error('KI-Bewertung fehlgeschlagen, Standardbewertung springt ein:', e.message || e);
    m.fallback = true;
    v = swap ? judge.standardJudge(r.case, m.promptB, m.promptA) : judge.standardJudge(r.case, m.promptA, m.promptB);
    v.reason = 'Die KI war gerade nicht erreichbar, deshalb hat der Baustein-Check entschieden. ' + v.reason;
  }
  const sw = (t) => String(t || '').replace(/\b(Prompt|Antwort) A\b/g, '$1 §').replace(/\b(Prompt|Antwort) B\b/g, '$1 A').replace(/\b(Prompt|Antwort) §/g, '$1 B');
  m.verdict = swap
    ? { winner: v.winner === 'A' ? 'b' : 'a', scoreA: v.scoreB, scoreB: v.scoreA, reason: sw(v.reason), strengthA: sw(v.strengthB), strengthB: sw(v.strengthA), tipA: sw(v.tipB), tipB: sw(v.tipA), cheatA: v.cheatB, cheatB: v.cheatA }
    : { winner: v.winner === 'A' ? 'a' : 'b', scoreA: v.scoreA, scoreB: v.scoreB, reason: v.reason, strengthA: v.strengthA, strengthB: v.strengthB, tipA: v.tipA, tipB: v.tipB, cheatA: v.cheatA, cheatB: v.cheatB };
  // Hat der Schiedsrichter die Bausteine eingestuft, ersetzt das die Marken des regelbasierten Checks:
  // die KI versteht auch ungewöhnliche Formulierungen, der Check erkennt nur Muster.
  const ka = swap ? v.checkB : v.checkA, kb = swap ? v.checkA : v.checkB;
  if (ka && m.checkA) m.checkA = uebernehmen(m.checkA, ka);
  if (kb && m.checkB) m.checkB = uebernehmen(m.checkB, kb);
}

function uebernehmen(check, ki) {
  const K = check.bekannt || KEYS;
  const stufen = { ...check.stufen }, zitate = { ...check.zitate };
  for (const k of K) {
    if (ki.stufen[k] === undefined) continue;
    stufen[k] = ki.stufen[k];
    if (ki.zitate[k]) zitate[k] = ki.zitate[k]; else if (!stufen[k]) delete zitate[k];
  }
  return { ...check, stufen, zitate, ki: true, anzahl: K.filter((k) => stufen[k] >= 2).length, alle: KEYS.filter((k) => stufen[k] >= 2).length };
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
      cands.push({ pid, prompt, check: side === 'a' ? m.checkA : m.checkB, output: (side === 'a' ? m.outA : m.outB) || '', score: (side === 'a' ? m.verdict.scoreA : m.verdict.scoreB) + (m.verdict.winner === side ? 5 : 0) });
    }
  }
  if (!cands.length) { r.best = null; return; }
  cands.sort((x, y) => y.score - x.score);
  const top = cands.slice(0, 4);
  let pick;
  try { pick = await judge.pickBest(r.case, top); } catch (e) { pick = judge.standardBest(r.case, top); r.bestError = e.message; }
  const w = top[pick.index];
  r.best = { pid: w.pid, name: room.players[w.pid].name, figure: room.players[w.pid].figure, prompt: w.prompt, output: w.output, reason: pick.reason, learn: pick.learn,
    check: rubrik.sicht(w.check, false) };
}

// Erklärung nach der Runde: der Baustein, um den es im Case ging, mit Zahlen aus den Prompts der Teilnehmer
function buildLesson(room, r) {
  const f = r.case.fokus;
  if (!f || (f !== ALLE && !byKey[f])) return null;
  const sides = [];
  for (const m of r.matches) {
    for (const side of ['a', 'b']) {
      const pid = m[side], check = side === 'a' ? m.checkA : m.checkB;
      if (pid === BOT || !check) continue;
      sides.push({ name: side === 'a' ? m.aName : m.bName, figure: side === 'a' ? m.aFigure : m.bFigure, check });
    }
  }
  const stat = (k) => ({
    key: k, nr: byKey[k].nr, name: byKey[k].name, gesamt: sides.length,
    mit: sides.filter((s) => s.check.stufen[k] >= 2).length, angedeutet: sides.filter((s) => s.check.stufen[k] === 1).length
  });
  const vergleich = r.case.ohne && r.case.mit ? { ohne: r.case.ohne, mit: r.case.mit } : null;
  if (f === ALLE) {
    return { final: true, stats: KEYS.map(stat), gesamt: sides.length, komplett: sides.filter((s) => s.check.alle === 6).length, vergleich, debrief: r.case.debrief || '', check: QUALITAETSCHECK };
  }
  const top = sides.filter((s) => s.check.stufen[f] >= 2 && s.check.zitate[f])
    .sort((x, y) => y.check.stufen[f] - x.check.stufen[f] || y.check.punkte - x.check.punkte)[0];
  return { final: false, baustein: byKey[f], stat: stat(f), vergleich, debrief: r.case.debrief || '', beispiel: top ? { name: top.name, figure: top.figure, zitat: top.check.zitate[f] } : null };
}

// Runde schließen: Duelle auslosen, Baustein-Check rechnen (sofort fertig) und die Erklärung des Bausteins zeigen.
// Die eigentliche Bewertung läuft währenddessen im Hintergrund. Aufgedeckt wird erst, wenn der Moderator weitergeht.
async function closeRound(room) {
  if (room.phase !== 'writing' || room.busy) return;
  room.busy = true;
  clearTimeout(room.timer);
  const r = room.rounds[room.roundIndex];
  const t0 = Date.now();
  let anzahl = 0;
  try {
    room.deadline = null;
    const pairs = makePairs(room, Object.keys(room.players));
    r.matches = pairs.map(([a, b]) => {
      if (b !== BOT) room.met[pairKey(a, b)] = (room.met[pairKey(a, b)] || 0) + 1; else room.botGames[a] = (room.botGames[a] || 0) + 1;
      const sa = snap(room, a), sb = snap(room, b);
      return { id: rid(4), a, b, aName: sa.name, aFigure: sa.figure, bName: sb.name, bFigure: sb.figure,
        promptA: r.submissions[a] || '', promptB: b === BOT ? botPrompt(r.case) : r.submissions[b] || '',
        outA: '', outB: '', verdict: null, error: null, walkover: false, manual: false, fallback: false };
    });
    for (const m of r.matches) { // Baustein-Check für jeden abgegebenen Prompt, unabhängig vom Schiedsrichter
      m.checkA = m.promptA ? rubrik.kurz(rubrik.analyse(m.promptA, r.case)) : null;
      m.checkB = m.promptB ? rubrik.kurz(rubrik.analyse(m.promptB, r.case)) : null;
    }
    r.lesson = buildLesson(room, r);
    r.lessonShown = !!r.lesson;
    r.revealed = false;
    r.best = null;
    const todo = r.matches.filter((m) => !walkover(m));
    anzahl = todo.length;
    room.judging = true;
    room.progress = { done: 0, total: todo.length + 1 };
    room.phase = r.lesson ? 'lesson' : 'judging';
    room.reveal = 0;
    changed(room);
    await pool(todo.map((m) => async () => {
      try { await evaluate(room, r, m); } catch (e) { m.error = e.message || String(e); console.error('Bewertung fehlgeschlagen:', m.error); }
      room.progress.done++;
      onChange(room);
    }), 8);
    if (judge.DEMO) await new Promise((res) => setTimeout(res, 800));
    if (!judge.DEMO) r.lesson = buildLesson(room, r); // Zahlen und Beispiel der Erklärung mit den Stufen des Schiedsrichters
    await chooseBest(room, r);
  } catch (e) {
    console.error('Fehler beim Schließen der Runde:', e);
  } finally {
    room.busy = false;
    room.judging = false;
    room.progress = null;
    if (room.phase === 'judging') { room.phase = 'reveal'; room.reveal = 0; r.revealed = true; } // Moderator wartet schon
    console.log('Runde ' + (room.roundIndex + 1) + ' in Raum ' + room.code + ': ' + anzahl + ' Duelle bewertet in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s' + (judge.DEMO ? ' (Standardbewertung)' : ''));
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
      const cs = body.cases.slice(0, 12).map((c) => {
        const min = Number(c.minuten);
        const sw = Array.isArray(c.stichworte) ? c.stichworte : String(c.stichworte || '').split(',');
        return {
          titel: String(c.titel || '').trim().slice(0, 80), aufgabe: String(c.aufgabe || '').trim().slice(0, 1200),
          material: String(c.material || '').trim().slice(0, 3000), kriterien: String(c.kriterien || '').trim().slice(0, 800),
          fokus: c.fokus === ALLE || byKey[c.fokus] ? c.fokus : '',
          stichworte: sw.map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 12),
          ohne: String(c.ohne || '').trim().slice(0, 1500), mit: String(c.mit || '').trim().slice(0, 1500),
          debrief: String(c.debrief || '').trim().slice(0, 400),
          minuten: min >= 0.5 && min <= 30 ? min : null
        };
      }).filter((c) => c.titel && c.aufgabe);
      if (!cs.length) fail('Jeder Case braucht einen Titel und eine Aufgabe.');
      room.cases = cs;
      break;
    }
    case 'start': startRound(room); return;
    case 'addTime': if (room.phase === 'writing') { room.deadline = Math.max(room.deadline || Date.now(), Date.now()) + 60000; armTimer(room); } break;
    case 'close': if (room.phase !== 'writing') fail('Es läuft gerade keine Schreibphase.'); closeRound(room).catch((e) => console.error(e)); return;
    case 'revealNext': if (room.phase === 'reveal') room.reveal = Math.min(r.matches.length, room.reveal + 1); break;
    case 'revealAll': if (room.phase === 'reveal') room.reveal = r.matches.length; break;
    case 'reveal': // von der Erklärung zu den Duellen. Läuft die Bewertung noch, erscheint solange der Wartebildschirm.
      if (room.phase !== 'lesson' || r.revealed) break;
      if (room.judging) room.phase = 'judging'; else { room.phase = 'reveal'; room.reveal = 0; r.revealed = true; }
      break;
    case 'best': if (room.phase === 'reveal') { room.reveal = r.matches.length; room.phase = r.best ? 'best' : 'board'; } break;
    case 'lesson': if (['reveal', 'best'].includes(room.phase) && r.lesson) { room.reveal = r.matches.length; room.phase = 'lesson'; } break; // Erklärung noch einmal zeigen
    case 'board':
      if (room.phase === 'lesson' && !r.revealed) fail('Erst die Duelle aufdecken.');
      if (['reveal', 'best', 'lesson'].includes(room.phase)) { room.reveal = r.matches.length; room.phase = 'board'; }
      break;
    case 'final': if (room.phase === 'board') room.phase = 'final'; break;
    case 'goto': { // freie Navigation innerhalb einer aufgedeckten Runde: Erklärung, Duelle, bester Prompt, Rangliste, Abschluss
      const ziel = String(body.target || '');
      if (!r || !r.revealed) fail('Erst die Duelle aufdecken.');
      if (!['lesson', 'reveal', 'best', 'board', 'final'].includes(ziel)) fail('Unbekanntes Ziel.');
      if (ziel === 'lesson' && !r.lesson) fail('Für diese Runde gibt es keine Erklärung.');
      if (ziel === 'best' && !r.best) fail('Es gibt noch keinen besten Prompt.');
      if (ziel === 'final' && room.roundIndex + 1 < room.settings.rounds) fail('Der Abschluss kommt nach der letzten Runde.');
      room.reveal = r.matches.length;
      room.phase = ziel;
      break;
    }
    case 'override': {
      const m = r && r.matches.find((x) => x.id === body.matchId);
      if (!m || !['a', 'b'].includes(body.winner)) fail('Ungültige Korrektur.');
      m.verdict = m.verdict || { scoreA: 50, scoreB: 50, strengthA: '', strengthB: '', tipA: '', tipB: '', cheatA: false, cheatB: false };
      m.verdict.winner = body.winner;
      m.verdict.reason = 'Entscheidung des Moderators.' + (m.manual || !m.verdict.reason ? '' : ' Ursprüngliche Begründung: ' + m.verdict.reason);
      m.manual = true; m.error = null; m.fallback = false;
      break;
    }
    case 'rejudge': {
      const m = r && r.matches.find((x) => x.id === body.matchId);
      if (!m || m.walkover) fail('Dieses Duell kann nicht neu bewertet werden.');
      try { await evaluate(room, r, m); m.manual = false; } catch (e) { m.error = e.message || String(e); }
      if (!judge.DEMO) r.lesson = buildLesson(room, r);
      await chooseBest(room, r).catch(() => {});
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
      if (r && room.phase === 'writing') { delete r.submissions[body.pid]; if (r.done) delete r.done[body.pid]; }
      break;
    }
    default: fail('Unbekannte Aktion.');
  }
  changed(room);
}

// ---------------------------------------------------------------- Sichten (wer sieht was)

function matchView(room, m, j, level) {
  // level: 'public' (Kurzfassung), 'full' (alle Texte)
  const open = allesOffen(room, room.rounds[room.roundIndex]) || (room.phase === 'reveal' && j < room.reveal);
  const v = {
    id: m.id, open,
    a: { pid: m.a, name: m.aName, figure: m.aFigure, bot: m.a === BOT },
    b: { pid: m.b, name: m.bName, figure: m.bFigure, bot: m.b === BOT }
  };
  if (!open && level !== 'host') return v;
  const vd = m.verdict;
  Object.assign(v, {
    winner: vd ? vd.winner : null, reason: vd ? vd.reason : '', scoreA: vd ? vd.scoreA : 0, scoreB: vd ? vd.scoreB : 0,
    cheatA: !!(vd && vd.cheatA), cheatB: !!(vd && vd.cheatB), walkover: m.walkover, manual: m.manual, fallback: !!m.fallback, error: level === 'host' ? m.error : (m.error ? 'Bewertung fehlgeschlagen' : null),
    checkA: rubrik.sicht(m.checkA, false), checkB: rubrik.sicht(m.checkB, false)
  });
  if (level === 'full' || level === 'host') {
    Object.assign(v, { promptA: m.promptA, promptB: m.promptB, outA: m.outA, outB: m.outB,
      strengthA: vd ? vd.strengthA : '', strengthB: vd ? vd.strengthB : '', tipA: vd ? vd.tipA : '', tipB: vd ? vd.tipB : '',
      checkA: rubrik.sicht(m.checkA, true), checkB: rubrik.sicht(m.checkB, true) });
  }
  return v;
}

// Fortschritt im Baukasten: Welche Bausteine wurden schon erklärt?
function baukasten(room) {
  const done = new Set();
  room.rounds.forEach((x, i) => {
    const offen = i < room.roundIndex || x.lessonShown; // erklärt ist ein Baustein, sobald seine Erklärung gezeigt wurde
    if (!offen || !x.lesson) return;
    if (x.case.fokus === ALLE) KEYS.forEach((k) => done.add(k)); else done.add(x.case.fokus);
  });
  const r = room.rounds[room.roundIndex];
  const jetzt = r && room.phase === 'lesson' ? r.case.fokus : null;
  // Namen künftiger Bausteine bleiben verdeckt
  return BAUSTEINE.map((b) => { const aktuell = jetzt === b.key || jetzt === ALLE, gelernt = done.has(b.key); return { key: b.key, nr: b.nr, name: gelernt || aktuell ? b.name : '?', figur: b.figur, gelernt, aktuell }; });
}

function view(room, client) {
  const r = room.rounds[room.roundIndex];
  const isHost = client.role === 'host';
  const me = client.role === 'player' ? room.players[client.pid] : null;
  const rank = ranking(room);
  const state = {
    code: room.code, phase: room.phase, round: room.roundIndex + 1, rounds: room.settings.rounds, seconds: room.settings.seconds,
    roundSeconds: r ? caseSeconds(room, r.case) : room.settings.seconds, baukasten: baukasten(room),
    now: Date.now(), deadline: room.deadline, reveal: room.reveal, progress: room.progress, demo: judge.DEMO,
    judging: !!room.judging, revealed: !!(r && r.revealed), hasLesson: !!(r && r.lesson), hasBest: !!(r && r.best),
    report: reportOk,
    players: rank.map((p) => ({ id: p.id, name: p.name, figure: p.figure, score: p.score, wins: p.wins, bonus: p.bonus, quality: p.quality,
      submitted: !!(r && room.phase === 'writing' && r.done && r.done[p.id]), draft: !!(r && room.phase === 'writing' && r.submissions[p.id]), online: [...room.clients].some((c) => c.pid === p.id) })),
    case: r && room.phase !== 'lobby' && room.phase !== 'final' ? { titel: r.case.titel, aufgabe: r.case.aufgabe, material: r.case.material } : null,
    matches: [], best: null, role: client.role
  };
  // Duelle sind erst sichtbar, wenn aufgedeckt wird. Während der Erklärung davor bleibt auch die Auslosung verdeckt.
  if (r && (['reveal', 'best', 'board'].includes(room.phase) || (room.phase === 'lesson' && r.revealed))) {
    state.matches = r.matches.map((m, j) => matchView(room, m, j, isHost ? 'host' : me && (m.a === me.id || m.b === me.id) ? 'full' : 'public'));
    if (allesOffen(room, r) && r.best) state.best = r.best;
  }
  if (r && room.phase === 'lesson' && r.lesson) {
    // vor dem Aufdecken ohne Namen, damit die Erklärung kein Ergebnis vorwegnimmt
    state.lesson = r.revealed || !r.lesson.beispiel ? r.lesson : { ...r.lesson, beispiel: { zitat: r.lesson.beispiel.zitat } };
    if (me) {
      const m = r.matches.find((x) => x.a === me.id || x.b === me.id);
      state.myCheck = m ? rubrik.sicht(m.a === me.id ? m.checkA : m.checkB, true) : null;
    }
  }
  if (me) {
    const same = (x, y) => x.score === y.score && x.bonus === y.bonus && x.quality === y.quality;
    state.me = { id: me.id, name: me.name, figure: me.figure, score: me.score, rank: rank.findIndex((p) => same(p, me)) + 1 };
    state.myPrompt = r && r.submissions[me.id] ? r.submissions[me.id] : '';
    state.myDone = !!(r && r.done && r.done[me.id]);
  } else if (client.role === 'player') {
    state.gone = true; // wurde entfernt
  }
  if (isHost) {
    state.cases = room.cases;
    state.models = { run: judge.MODEL_RUN, judge: judge.MODEL_JUDGE };
    state.history = room.rounds.map((x) => ({ titel: x.case.titel, best: x.best ? displayName(x.best.name, x.best.figure) : null }));
    state.bausteine = BAUSTEINE.map((b) => ({ key: b.key, nr: b.nr, name: b.name }));
  }
  return state;
}

function exportRoom(room) {
  return {
    code: room.code, erstellt: new Date(room.createdAt).toISOString(),
    rangliste: ranking(room).map((p, i) => ({ platz: i + 1, name: p.name, kreatur: labelOf(p.figure), punkte: p.score, siege: p.wins, bonus: p.bonus, wertung: p.quality })),
    runden: room.rounds.map((r) => ({
      runde: r.index + 1, case: r.case.titel, baustein: r.case.fokus === ALLE ? 'alle' : byKey[r.case.fokus] ? byKey[r.case.fokus].name : '',
      besterPrompt: r.best ? { name: displayName(r.best.name, r.best.figure), prompt: r.best.prompt, begruendung: r.best.reason, lernpunkt: r.best.learn } : null,
      duelle: r.matches.map((m) => ({ a: displayName(m.aName, m.aFigure), b: displayName(m.bName, m.bFigure), promptA: m.promptA, promptB: m.promptB, antwortA: m.outA, antwortB: m.outB,
        bausteineA: m.checkA ? m.checkA.stufen : null, bausteineB: m.checkB ? m.checkB.stufen : null,
        sieger: m.verdict && m.verdict.winner ? (m.verdict.winner === 'a' ? displayName(m.aName, m.aFigure) : displayName(m.bName, m.bFigure)) : null, begruendung: m.verdict ? m.verdict.reason : '', fehler: m.error }))
    }))
  };
}

// Wie oft ist jede Kreatur im Raum schon vergeben? (für die Auswahl beim Beitreten)
function taken(room) {
  const t = {};
  for (const p of Object.values(room.players)) t[p.figure] = (t[p.figure] || 0) + 1;
  return t;
}

module.exports = { taken, ranking, rooms, createRoom, getRoom, cleanup, join, auth, submit, hostAction, view, exportRoom, setBroadcaster, load, GameError, FIGURES, MAX_PROMPT };
