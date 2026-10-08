// Teilnehmeransicht
'use strict';
const app = document.getElementById('app');
const KEY = 'pb-player';
let me = store.get(KEY);            // { room, pid, key, name, figure }
let es = null, state = null, viewKey = '', refs = {}, saveTimer = null, tick = null, info = { maxPrompt: 2000, demo: false };

const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();

(async function init() {
  try { info = await api('/api/info'); } catch (_) {}
  if (me && urlRoom && me.room !== urlRoom) me = null;   // Link zu einem anderen Raum
  if (me) {
    try { await api('/api/room?room=' + me.room); return start(); } catch (_) { me = null; store.del(KEY); }
  }
  showJoin();
})();

// ---------------------------------------------------------------- Beitreten
function showJoin(prefill) {
  if (es) { es.close(); es = null; }
  clearInterval(tick);
  viewKey = '';
  let figure = (prefill && prefill.figure) || null;
  const err = h('div', { class: 'error' });
  const code = h('input', { type: 'text', maxlength: 4, autocapitalize: 'characters', autocomplete: 'off', placeholder: 'z. B. KLMN', value: urlRoom || (prefill && prefill.room) || '', style: 'text-transform:uppercase;letter-spacing:.2em;font-size:1.3rem;max-width:11em' });
  const name = h('input', { type: 'text', maxlength: 20, placeholder: 'z. B. Prompta die Große', value: (prefill && prefill.name) || '' });
  const picks = Object.entries(FIGS).map(([id, f]) => {
    const b = h('button', { type: 'button', class: 'figpick' + (figure === id ? ' sel' : ''), 'aria-pressed': figure === id ? 'true' : 'false', onclick: () => { figure = id; picks.forEach((p) => { p.classList.toggle('sel', p === b); p.setAttribute('aria-pressed', p === b ? 'true' : 'false'); }); } },
      figImg(id), f.label, h('small', { text: f.hint }));
    return b;
  });
  const go = h('button', { class: 'primary', type: 'submit', text: 'Mitspielen' });
  const form = h('form', { class: 'card stack', onsubmit: async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    go.disabled = true;
    try {
      const r = await api('/api/join', { room: code.value.trim().toUpperCase(), name: name.value, figure, pid: prefill && prefill.pid, key: prefill && prefill.key });
      me = { room: r.room, pid: r.pid, key: r.key, name: name.value.trim(), figure };
      store.set(KEY, me);
      history.replaceState(null, '', '/?room=' + r.room);
      start();
    } catch (e) { err.textContent = e.message; go.disabled = false; }
  } },
    h('div', {}, h('h1', {}, h('span', { class: 'orange', text: '>_ ' }), 'Prompt Battle'), h('p', { class: 'muted', text: 'Wähle deine Figur, gib ihr einen Namen und tritt mit deinen Prompts gegen die anderen an.' })),
    h('div', {}, h('label', { text: 'Raumcode' }), code),
    h('div', {}, h('label', { text: 'Deine Figur' }), h('div', { class: 'figgrid' }, picks)),
    h('div', {}, h('label', { text: 'Name deiner Figur' }), name),
    err,
    h('div', { class: 'row' }, go),
    h('p', { class: 'small muted', text: 'Hinweis: Deine Prompts werden zur Bewertung an einen KI-Dienst geschickt und sind für die Moderation sichtbar. Bitte gib keine vertraulichen oder personenbezogenen Daten ein.' }));
  app.replaceChildren(form);
  (code.value ? name : code).focus();
}

// ---------------------------------------------------------------- Im Raum
function start() {
  if (es) es.close();
  es = connect('room=' + me.room + '&pid=' + me.pid + '&key=' + me.key, onState, async () => {
    try { await api('/api/room?room=' + me.room); } catch (_) { store.del(KEY); const old = me; me = null; showJoin(old); }
  });
  clearInterval(tick);
  tick = setInterval(updateClock, 250);
}

function onState(s) {
  state = s;
  if (s.gone) { const old = me; store.del(KEY); me = null; return showJoin(old); }
  const mine = myMatch();
  const key = [s.phase, s.round, mine ? mine.id + ':' + mine.open : '-', s.phase === 'best' || s.phase === 'board' || s.phase === 'final' ? JSON.stringify(s.players.map((p) => [p.id, p.score])) : '', s.phase === 'lobby' ? s.players.length : ''].join('|');
  if (key !== viewKey) { viewKey = key; refs = {}; render(); }
  update();
}

const myMatch = () => state && state.matches.find((m) => m.a.pid === me.pid || m.b.pid === me.pid);

function header() {
  const s = state;
  return h('div', { class: 'me-bar' },
    figImg(s.me.figure),
    h('div', { class: 'grow' }, h('div', { class: 'nm', text: s.me.name }), h('div', { class: 'small muted', text: 'Raum ' + s.code + (s.round ? ' · Runde ' + s.round + ' von ' + s.rounds : '') })),
    h('span', { class: 'badge orange', text: s.me.score + (s.me.score === 1 ? ' Punkt' : ' Punkte') }));
}

function render() {
  const s = state;
  const kids = [header()];
  if (s.demo) kids.push(h('div', { class: 'banner', text: 'Demo-Modus: Es ist kein KI-Schlüssel hinterlegt, bewertet wird nach einer einfachen Faustregel.' }));
  const body = { lobby: vLobby, writing: vWriting, judging: vJudging, reveal: vReveal, best: vBest, board: vBoard, final: vFinal }[s.phase]();
  app.replaceChildren(h('div', { class: 'stack' }, kids, body));
  if (s.phase === 'final' && s.me.rank === 1) confetti();
}

function update() {
  const s = state;
  if (s.phase === 'lobby' && refs.count) refs.count.textContent = s.players.length + ' im Raum';
  if (s.phase === 'judging' && refs.prog && s.progress) refs.prog.style.width = Math.round((s.progress.done / Math.max(1, s.progress.total)) * 100) + '%';
  updateClock();
}

function updateClock() {
  if (!state || !refs.timer) return;
  const ms = remaining(state);
  if (ms == null) return;
  refs.timer.textContent = clock(ms);
  refs.timer.classList.toggle('low', ms < 30000);
}

// ---- Lobby
function vLobby() {
  refs.count = h('span', { class: 'badge' });
  return h('div', { class: 'card stack center' },
    h('h2', { text: 'Du bist dabei!' }),
    h('div', { class: 'waitfig' }, figImg(state.me.figure)),
    h('p', { text: 'Gleich geht es los. Die Moderation startet die erste Runde.' }),
    h('div', {}, refs.count),
    h('div', {}, h('button', { class: 'ghost', text: 'Figur oder Namen ändern', onclick: () => showJoin(me) })));
}

// ---- Schreiben
function caseCard(c) {
  return h('div', { class: 'card alt' },
    h('div', { class: 'muted hand', text: 'Runde ' + state.round + ': der Case' }),
    h('h2', { text: c.titel }),
    h('p', { class: 'pre', text: c.aufgabe }),
    c.material ? h('div', {}, h('div', { class: 'hand', text: 'Material' }), h('div', { class: 'box pre small', text: c.material })) : null);
}

function vWriting() {
  const s = state;
  refs.timer = h('div', { class: 'timer' });
  refs.status = h('span', { class: 'small muted' });
  const ta = h('textarea', { maxlength: info.maxPrompt, placeholder: 'Schreibe hier deinen Prompt …', rows: 9 });
  ta.value = s.myPrompt || '';
  const count = h('span', { class: 'small muted' });
  const setCount = () => { count.textContent = ta.value.length + ' / ' + info.maxPrompt + ' Zeichen'; };
  setCount();
  let sent = s.myPrompt || '';
  const send = async (manual) => {
    clearTimeout(saveTimer);
    if (state.phase !== 'writing') return;
    const text = ta.value;
    if (text === sent && !manual) return;
    try {
      await api('/api/submit', { room: me.room, pid: me.pid, key: me.key, text });
      sent = text;
      refs.status.textContent = text.trim() ? (manual ? 'Abgegeben. Du kannst bis zum Ende der Zeit weiter ändern.' : 'Automatisch gespeichert.') : 'Noch nichts abgegeben.';
      refs.status.className = 'small ' + (text.trim() ? 'orange' : 'muted');
    } catch (e) { refs.status.textContent = e.message; refs.status.className = 'small error'; }
  };
  ta.addEventListener('input', () => { setCount(); clearTimeout(saveTimer); saveTimer = setTimeout(() => send(false), 1200); });
  refs.status.textContent = sent ? 'Dein Prompt ist gespeichert.' : 'Noch nichts abgegeben.';
  setTimeout(() => ta.focus(), 50);
  return h('div', { class: 'stack' },
    caseCard(s.case),
    h('div', { class: 'card stack' },
      h('div', { class: 'row' }, h('h3', { class: 'grow', text: 'Dein Prompt' }), refs.timer),
      ta,
      h('div', { class: 'row' }, h('button', { class: 'primary', text: 'Abschicken', onclick: () => send(true) }), h('span', { class: 'grow' }), count),
      refs.status));
}

// ---- Bewertung läuft
function vJudging() {
  refs.prog = h('div', { style: 'width:0%' });
  return h('div', { class: 'card stack center' },
    h('h2', { text: 'Der Schiedsrichter prüft eure Prompts …' }),
    h('div', { class: 'waitfig' }, figImg(state.me.figure)),
    h('div', { class: 'progress', style: 'width:100%' }, refs.prog),
    h('p', { class: 'muted', text: 'Jeder Prompt wird ausgeführt und mit dem des Gegners verglichen.' }));
}

// ---- Eigenes Duell
function myDuel(animate) {
  const m = myMatch();
  if (!m) return h('div', { class: 'card center' }, h('h3', { text: 'In dieser Runde warst du noch nicht ausgelost.' }), h('p', { class: 'muted', text: 'Ab der nächsten Runde bist du dabei.' }));
  const side = m.a.pid === me.pid ? 'a' : 'b', other = side === 'a' ? 'b' : 'a';
  const S = side.toUpperCase(), O = other.toUpperCase();
  if (!m.open) {
    return h('div', { class: 'card stack center' },
      h('h3', { text: 'Dein Duell: ' + m[side].name + ' gegen ' + m[other].name }),
      duelEl(m),
      h('p', { class: 'muted', text: 'Gleich wird aufgedeckt …' }));
  }
  const won = m.winner === side, draw = !m.winner;
  const banner = h('div', { class: 'result-banner ' + (won ? 'orange' : ''), text: draw ? 'Kein Sieger' : won ? 'Sieg! +1 Punkt' : 'Diesmal hat es nicht gereicht' });
  if (animate) { banner.style.visibility = 'hidden'; setTimeout(() => { banner.style.visibility = ''; }, 2800); }
  return h('div', { class: 'card stack' },
    banner,
    duelEl(m, { animate }),
    m.reason ? h('p', { class: 'verdict' }, h('b', { text: 'Urteil: ' }), m.reason) : null,
    m['cheat' + S] ? h('div', { class: 'banner', text: 'Der Schiedsrichter hat einen Beeinflussungsversuch in deinem Prompt bemerkt. Netter Versuch!' }) : null,
    m['strength' + S] ? h('p', {}, h('b', { text: 'Deine Stärke: ' }), m['strength' + S]) : null,
    m['tip' + S] ? h('p', {}, h('b', { class: 'orange', text: 'Tipp für dich: ' }), m['tip' + S]) : null,
    h('details', {}, h('summary', { text: 'Dein Prompt und die Antwort der KI' }), h('div', { class: 'box pre small', text: m['prompt' + S] || '(nichts abgegeben)' }), m['out' + S] ? h('div', { class: 'pre small', style: 'margin-top:8px', text: m['out' + S] }) : null),
    h('details', {}, h('summary', { text: 'Prompt von ' + m[other].name + ' und die Antwort der KI' }), h('div', { class: 'box pre small', text: m['prompt' + O] || '(nichts abgegeben)' }), m['out' + O] ? h('div', { class: 'pre small', style: 'margin-top:8px', text: m['out' + O] }) : null));
}

let animated = '';
function vReveal() {
  const m = myMatch();
  const k = m && m.open ? state.round + ':' + m.id : '';
  const animate = !!k && animated !== k;
  if (animate) animated = k;
  const open = state.matches.filter((x) => x.open && x !== m);
  return h('div', { class: 'stack' },
    myDuel(animate),
    open.length ? h('div', { class: 'card alt' }, h('h3', { text: 'Schon aufgedeckt' }), h('div', { class: 'mlist', style: 'margin-top:8px' }, open.map(matchRow))) : null);
}

function matchRow(m) {
  return h('div', { class: 'mrow' },
    h('span', { class: 's ' + (m.winner === 'a' ? 'win' : m.winner ? 'lose' : ''), text: m.a.name }),
    h('span', { class: 'mid', text: 'gegen' }),
    h('span', { class: 's b ' + (m.winner === 'b' ? 'win' : m.winner ? 'lose' : ''), text: m.b.name }));
}

function vBest() {
  return h('div', { class: 'stack' }, state.best ? bestEl(state.best, { showOutput: true }) : null, myDuel(false));
}

function vBoard() {
  return h('div', { class: 'stack' },
    h('div', { class: 'card alt stack' }, h('h2', { text: 'Rangliste nach Runde ' + state.round }), boardEl(state.players, me.pid), h('p', { class: 'small muted', text: TIE_NOTE })),
    h('p', { class: 'center muted', text: state.round < state.rounds ? 'Gleich startet die nächste Runde.' : 'Das war die letzte Runde. Gleich folgt die Siegerehrung.' }));
}

function vFinal() {
  const r = state.me.rank;
  return h('div', { class: 'stack' },
    h('div', { class: 'card accent stack center' },
      h('h1', { text: r === 1 ? 'Du hast das Prompt Battle gewonnen!' : 'Platz ' + r + ' von ' + state.players.length }),
      h('div', { class: 'waitfig' }, figImg(state.me.figure)),
      h('p', { text: state.me.score + (state.me.score === 1 ? ' Punkt' : ' Punkte') + ' für ' + state.me.name })),
    h('div', { class: 'card alt stack' }, h('h2', { text: 'Endstand' }), boardEl(state.players, me.pid), h('p', { class: 'small muted', text: TIE_NOTE })));
}
