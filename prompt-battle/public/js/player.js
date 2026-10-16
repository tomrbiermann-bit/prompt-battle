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
  const name = h('input', { type: 'text', maxlength: 20, autocomplete: 'given-name', placeholder: 'Vorname genügt, z. B. Tom', value: (prefill && prefill.name) || '' });
  const preview = h('div', { class: 'namepreview hand' });
  const showPreview = () => {
    const n = name.value.replace(/\s+/g, ' ').trim();
    preview.replaceChildren(...(n && figure ? ['Du spielst als ', h('b', { class: 'orange', text: dn({ name: n, figure }) })] : [h('span', { class: 'muted', text: n ? 'Jetzt noch eine Kreatur wählen.' : 'Erst deinen Namen eintragen, dann eine Kreatur wählen.' })]));
  };
  const picks = FIGURES.map((f) => {
    const cnt = h('span', { class: 'takenmark hidden' });
    const b = h('button', { type: 'button', class: 'figpick' + (figure === f.id ? ' sel' : ''), 'aria-pressed': figure === f.id ? 'true' : 'false', 'data-fig': f.id, onclick: () => { figure = f.id; picks.forEach((p) => { p.classList.toggle('sel', p === b); p.setAttribute('aria-pressed', p === b ? 'true' : 'false'); }); showPreview(); } },
      cnt, figImg(f.id), f.label, h('small', { text: f.hint }));
    b.cnt = cnt;
    return b;
  });
  // zeigt, welche Kreaturen im Raum schon gewählt wurden (doppelt wählen bleibt erlaubt)
  const loadTaken = async () => {
    const c = code.value.trim().toUpperCase();
    if (c.length !== 4) return;
    try {
      const r = await api('/api/room?room=' + c);
      picks.forEach((b) => { const n = (r.taken || {})[b.getAttribute('data-fig')] || 0; b.cnt.textContent = n + ' x gewählt'; b.cnt.classList.toggle('hidden', !n); });
    } catch (_) { /* Raum noch unbekannt */ }
  };
  code.addEventListener('input', loadTaken);
  name.addEventListener('input', showPreview);
  const go = h('button', { class: 'primary', type: 'submit', text: 'Mitspielen' });
  const form = h('form', { class: 'card stack', onsubmit: async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    go.disabled = true;
    try {
      const r = await api('/api/join', { room: code.value.trim().toUpperCase(), name: name.value, figure, pid: prefill && prefill.pid, key: prefill && prefill.key });
      me = { room: r.room, pid: r.pid, key: r.key, name: name.value.replace(/\s+/g, ' ').trim(), figure };
      store.set(KEY, me);
      history.replaceState(null, '', '/?room=' + r.room);
      start();
    } catch (e) { err.textContent = e.message; go.disabled = false; }
  } },
    h('div', {}, h('h1', {}, h('span', { class: 'orange', text: '>_ ' }), 'Prompt Battle'), h('p', { class: 'muted', text: 'Trag deinen Namen ein, such dir eine Kreatur aus und tritt mit deinen Prompts gegen die anderen an.' })),
    h('div', {}, h('label', { text: 'Raumcode' }), code),
    h('div', {}, h('label', { text: '1. Dein Name' }), name),
    h('div', {}, h('label', { text: '2. Deine Kreatur' }), h('div', { class: 'figgrid' }, picks)),
    preview,
    err,
    h('div', { class: 'row' }, go),
    h('p', { class: 'small muted', text: info.demo
      ? 'Hinweis: Deine Prompts bleiben auf dem Spielserver, werden dort automatisch nach den Bausteinen geprüft und sind für Moderation und Gegner sichtbar. Bitte gib keine vertraulichen oder personenbezogenen Daten ein.'
      : 'Hinweis: Deine Prompts werden zur Bewertung an einen KI-Dienst geschickt und sind für Moderation und Gegner sichtbar. Bitte gib keine vertraulichen oder personenbezogenen Daten ein.' }));
  app.replaceChildren(form);
  showPreview();
  loadTaken();
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
  const key = [s.phase, s.round, mine ? mine.id + ':' + mine.open : '-', s.phase === 'best' || s.phase === 'lesson' || s.phase === 'board' || s.phase === 'final' ? JSON.stringify(s.players.map((p) => [p.id, p.score])) : '', s.phase === 'lobby' ? s.players.length : '', s.phase === 'lesson' ? [s.revealed, s.judging].join() : ''].join('|');
  if (key !== viewKey) { viewKey = key; refs = {}; render(); }
  update();
}

const myMatch = () => state && state.matches.find((m) => m.a.pid === me.pid || m.b.pid === me.pid);

function header() {
  const s = state;
  return h('div', { class: 'me-bar' },
    figImg(s.me.figure),
    h('div', { class: 'grow' }, h('div', { class: 'nm', text: dn(s.me) }), h('div', { class: 'small muted', text: 'Raum ' + s.code + (s.round ? ' · Runde ' + s.round + ' von ' + s.rounds : '') })),
    h('span', { class: 'badge orange', text: s.me.score + (s.me.score === 1 ? ' Punkt' : ' Punkte') }));
}

function render() {
  const s = state;
  const kids = [header()];
  const body = { lobby: vLobby, writing: vWriting, judging: vJudging, reveal: vReveal, best: vBest, lesson: vLesson, board: vBoard, final: vFinal }[s.phase]();
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
    h('div', {}, h('button', { class: 'ghost', text: 'Namen oder Kreatur ändern', onclick: () => showJoin(me) })));
}

// ---- Schreiben
function caseCard(c) {
  return h('div', { class: 'card alt' },
    h('div', { class: 'muted hand', text: 'Runde ' + state.round + ': der Case' }),
    h('h2', { text: c.titel }),
    h('p', { class: 'pre', text: c.aufgabe }),
    c.material ? h('details', { open: true, class: 'material' }, h('summary', { text: 'Material (zum Einklappen antippen)' }), h('div', { class: 'box pre small', text: c.material })) : null);
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
  let sent = s.myPrompt || '', done = !!s.myDone;
  const zeige = () => {
    const text = ta.value.trim();
    const ungespeichert = ta.value !== sent;
    refs.status.textContent = !text ? 'Noch nichts abgegeben.' : done && !ungespeichert ? 'Abgeschickt. Du kannst bis zum Ende der Zeit weiter ändern und erneut abschicken.' : done && ungespeichert ? 'Geändert. Drücke erneut auf Abschicken, sonst zählt dein Entwurf.' : 'Entwurf gespeichert. Drücke auf Abschicken, wenn du fertig bist.';
    refs.status.className = 'small ' + (!text ? 'muted' : done && !ungespeichert ? 'green' : 'orange');
    refs.go.textContent = done && !ungespeichert ? 'Abgeschickt' : 'Abschicken';
    refs.go.className = done && !ungespeichert ? 'ghost' : 'primary';
  };
  const send = async (manual) => {
    clearTimeout(saveTimer);
    if (state.phase !== 'writing') return;
    const text = ta.value;
    if (text === sent && !manual) return;
    try {
      await api('/api/submit', { room: me.room, pid: me.pid, key: me.key, text, final: !!manual });
      sent = text;
      done = !!manual && !!text.trim();
      zeige();
    } catch (e) { refs.status.textContent = e.message; refs.status.className = 'small error'; }
  };
  ta.addEventListener('input', () => { setCount(); if (done) done = false; zeige(); clearTimeout(saveTimer); saveTimer = setTimeout(() => send(false), 1200); });
  refs.go = h('button', { class: 'primary', text: 'Abschicken', onclick: () => send(true) });
  zeige();
  setTimeout(() => ta.focus(), 50);
  return h('div', { class: 'stack' },
    caseCard(s.case),
    h('div', { class: 'card stack' },
      h('div', { class: 'row' }, h('h3', { class: 'grow', text: 'Dein Prompt' }), refs.timer),
      ta,
      h('div', { class: 'row' }, refs.go, h('span', { class: 'grow' }), count),
      refs.status));
}

// ---- Bewertung läuft
function vJudging() {
  refs.prog = h('div', { style: 'width:0%' });
  return h('div', { class: 'card stack center' },
    h('h2', { text: 'Der Schiedsrichter prüft eure Prompts …' }),
    h('div', { class: 'waitfig' }, figImg(state.me.figure)),
    h('div', { class: 'progress', style: 'width:100%' }, refs.prog),
    h('p', { class: 'muted', text: state.demo ? 'Jeder Prompt wird geprüft und mit dem des Gegners verglichen.' : 'Jeder Prompt wird ausgeführt und mit dem des Gegners verglichen.' }));
}

// ---- Eigenes Duell
function myDuel(animate) {
  const m = myMatch();
  if (!m) return h('div', { class: 'card center' }, h('h3', { text: 'In dieser Runde warst du noch nicht ausgelost.' }), h('p', { class: 'muted', text: 'Ab der nächsten Runde bist du dabei.' }));
  const side = m.a.pid === me.pid ? 'a' : 'b', other = side === 'a' ? 'b' : 'a';
  const S = side.toUpperCase(), O = other.toUpperCase();
  if (!m.open) {
    return h('div', { class: 'card stack center' },
      h('h3', { text: 'Dein Duell: ' + dn(m[side]) + ' gegen ' + dn(m[other]) }),
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
    m['check' + S] ? checkCard(m['check' + S]) : null,
    h('details', {}, h('summary', { text: m['out' + S] ? 'Dein Prompt und die Antwort der KI' : 'Dein Prompt' }), h('div', { class: 'box pre small', text: m['prompt' + S] || '(nichts abgegeben)' }), m['out' + S] ? h('div', { class: 'pre small', style: 'margin-top:8px', text: m['out' + S] }) : null),
    h('details', {}, h('summary', { text: 'Prompt von ' + dn(m[other]) + (m['out' + O] ? ' und die Antwort der KI' : '') }), h('div', { class: 'box pre small', text: m['prompt' + O] || '(nichts abgegeben)' }), m['out' + O] ? h('div', { class: 'pre small', style: 'margin-top:8px', text: m['out' + O] }) : null));
}

// Baustein-Check des eigenen Prompts: sechs Zeilen mit Stufe und Fundstelle
function checkCard(check) {
  return h('details', { class: 'checkcard' }, h('summary', {}, 'Dein Baustein-Check: ' + check.anzahl + ' von ' + check.gesamt + ' ', chipsEl(check, { names: false })),
    h('div', { class: 'checklist' }, BAUSTEINE.filter((b) => check.stufen[b.key] !== undefined).map((b) => {
      const st = check.stufen[b.key] || 0;
      return h('div', { class: 'checkrow' }, h('span', { class: 'chip l' + st }, h('b', { text: b.nr }), h('span', { text: b.kurz })), h('span', { class: 'small' }, h('b', { text: STUFE[st] }), check.zitate && check.zitate[b.key] ? ': "' + check.zitate[b.key] + '"' : ''));
    })),
    check.technik && check.technik.length ? h('p', { class: 'small' }, h('b', { text: 'Technik erkannt: ' }), check.technik.join(', ')) : null,
    check.gesamt < 6 ? h('p', { class: 'small muted', text: 'Gewertet werden die Bausteine, die ihr schon kennt. Mit jeder Runde kommt einer dazu.' }) : null,
    h('p', { class: 'small muted', text: 'Der Baustein-Check erkennt Formulierungen. Ob eine Rolle oder ein Kriterium klug gewählt ist, beurteilt ihr im Gespräch.' }));
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
    h('span', { class: 's ' + (m.winner === 'a' ? 'win' : m.winner ? 'lose' : ''), text: dn(m.a) }),
    h('span', { class: 'mid', text: 'gegen' }),
    h('span', { class: 's b ' + (m.winner === 'b' ? 'win' : m.winner ? 'lose' : ''), text: dn(m.b) }));
}

function vBest() {
  return h('div', { class: 'stack' }, state.best ? bestEl(state.best, { showOutput: true }) : null, myDuel(false));
}

// ---- Erklärung des Bausteins nach der Runde
function vLesson() {
  const L = state.lesson;
  if (!L) return vBoard();
  const mine = state.myCheck || null;
  // Die Erklärung läuft, während im Hintergrund bewertet wird. Danach werden die Duelle aufgedeckt.
  const weiter = h('p', { class: 'center muted', text: state.revealed ? 'Gleich folgt die Rangliste.' : state.judging ? 'Eure Prompts werden gerade bewertet. Danach werden die Duelle aufgedeckt.' : 'Die Bewertung ist fertig. Gleich werden die Duelle aufgedeckt.' });
  if (L.final) {
    return h('div', { class: 'stack' },
      h('div', { class: 'card accent stack' },
        h('div', { class: 'muted hand', text: 'Abschluss' }), h('h1', { text: 'Der ganze Baukasten' }),
        h('p', { text: L.komplett + ' von ' + L.gesamt + ' Prompts hatten alle sechs Bausteine.' + (mine ? ' Deiner hatte ' + mine.anzahl + ' von ' + mine.gesamt + '.' : '') }),
        h('div', { class: 'checklist' }, L.stats.map((st) => h('div', { class: 'checkrow' },
          mine ? h('span', { class: 'chip l' + (mine.stufen[st.key] || 0) }, h('b', { text: st.nr }), h('span', { text: st.name })) : h('span', { class: 'chip l2' }, h('b', { text: st.nr }), h('span', { text: st.name })),
          h('span', { class: 'small grow' }, statBar(st), st.mit + ' von ' + st.gesamt + ' Prompts'))))),
      h('div', { class: 'card alt' }, qcEl(L.check)),
      L.debrief ? debriefEl(L.debrief) : null,
      L.vergleich ? h('details', {}, h('summary', { text: 'Muster-Prompt mit allen sechs Bausteinen' }), h('div', { class: 'box pre small', text: L.vergleich.mit })) : null,
      weiter);
  }
  const st = mine ? mine.stufen[L.baustein.key] || 0 : null;
  return h('div', { class: 'stack' },
    h('div', { class: 'card accent' }, bausteinEl(L.baustein)),
    h('div', { class: 'card alt stack' },
      h('h3', { text: 'In dieser Runde' }),
      h('p', {}, h('b', { text: L.stat.mit + ' von ' + L.stat.gesamt })), statBar(L.stat),
      h('p', { class: 'small muted', text: 'Prompts mit dem Baustein ' + L.baustein.name + (L.stat.angedeutet ? ', bei ' + L.stat.angedeutet + ' weiteren war er angedeutet' : '') + '.' }),
      st != null ? h('p', {}, h('b', { text: 'In deinem Prompt: ' }), STUFE[st] + (mine.zitate && mine.zitate[L.baustein.key] ? ' ("' + mine.zitate[L.baustein.key] + '")' : '') + '.') : null,
      L.beispiel ? h('p', {}, h('b', { class: 'orange', text: (L.beispiel.name ? 'Stark gelöst von ' + dn(L.beispiel) : 'Stark gelöst in einem eurer Prompts') + ': ' }), '"' + L.beispiel.zitat + '"') : null),
    L.debrief ? debriefEl(L.debrief) : null,
    L.vergleich ? h('details', {}, h('summary', { text: 'So sieht das im Prompt aus' }), h('div', { class: 'small', style: 'margin-top:8px' }, vergleichEl(L.vergleich))) : null,
    weiter);
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
      h('p', { text: state.me.score + (state.me.score === 1 ? ' Punkt' : ' Punkte') + ' für ' + dn(state.me) }),
      state.report ? h('div', {}, h('a', { class: 'btn primary', href: '/api/report?room=' + me.room + '&pid=' + me.pid + '&key=' + me.key, download: '', text: 'Meinen Bericht als PDF herunterladen' })) : null,
      state.report ? h('p', { class: 'small muted', text: 'Der Bericht enthält deine Prompts mit Bewertung, Stärke und Tipp aus jeder Runde. Lade ihn jetzt herunter, später ist der Raum nicht mehr erreichbar.' }) : null),
    h('div', { class: 'card alt stack' }, h('h2', { text: 'Endstand' }), boardEl(state.players, me.pid), h('p', { class: 'small muted', text: TIE_NOTE })));
}
