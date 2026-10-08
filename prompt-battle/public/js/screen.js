// Beameransicht, mit Moderator-Steuerung, wenn auf diesem Gerät der Raum eröffnet wurde
'use strict';
const stage = document.getElementById('stage');
const controls = document.getElementById('controls');
const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
const token = ((store.get('pb-host') || {})[room]) || null;
let isHost = false, state = null, viewKey = '', ctlKey = '', refs = {}, selected = null, details = false, showOut = false;
let lastReveal = '', modalRefresh = null, celebrated = false;
const seenAnim = new Set(), knownPlayers = new Set();

(async function init() {
  if (!room) { location.href = '/host'; return; }
  if (token) { try { await api('/api/host/check', { room, token }); isHost = true; } catch (_) {} }
  try { await api('/api/room?room=' + room); } catch (e) {
    stage.replaceChildren(h('div', { class: 'stage-center' }, h('h1', { text: e.message }), h('a', { class: 'btn primary', href: '/host', text: 'Zur Moderation' })));
    return;
  }
  if (isHost) controls.classList.remove('hidden');
  connect('room=' + room + (isHost ? '&token=' + token : ''), onState);
  setInterval(tickClock, 250);
})();

const act = (action, extra) => api('/api/host/action', { room, token, action, ...(extra || {}) }).then(() => setErr('')).catch((e) => setErr(e.message));
function setErr(msg) { if (refs.err) refs.err.textContent = msg; }

const PHASE_LABEL = { lobby: 'Lobby', writing: 'Schreibphase', judging: 'Bewertung', reveal: 'Duelle', best: 'Bester Prompt', board: 'Rangliste', final: 'Siegerehrung' };

function onState(s) {
  state = s;
  document.getElementById('roundinfo').textContent = (s.round ? 'Runde ' + s.round + ' von ' + s.rounds + ' · ' : '') + PHASE_LABEL[s.phase];
  document.getElementById('joininfo').replaceChildren('Mitspielen: ', h('b', { text: location.host }), ' · Code ', h('b', { class: 'orange', text: s.code }));
  const rv = s.round + ':' + s.reveal;
  if (rv !== lastReveal) { lastReveal = rv; selected = null; details = false; }
  const sig = (m) => [m.id, m.open, m.winner, m.error ? 1 : 0, m.manual ? 1 : 0, m.reason ? m.reason.length : 0].join(',');
  const key = {
    lobby: () => 'lobby',
    writing: () => 'writing|' + s.round,
    judging: () => 'judging|' + s.round,
    reveal: () => ['reveal', s.round, s.reveal, selected, details, s.matches.map(sig).join(';')].join('|'),
    best: () => 'best|' + s.round + '|' + showOut,
    board: () => 'board|' + s.round + '|' + s.players.map((p) => p.id + p.score).join(','),
    final: () => 'final|' + s.players.map((p) => p.id + p.score).join(',')
  }[s.phase]();
  if (key !== viewKey) { viewKey = key; const keep = refs.err; refs = { err: keep }; stage.replaceChildren(VIEWS[s.phase]()); }
  UPDATES[s.phase] && UPDATES[s.phase]();
  if (isHost) {
    const ck = [s.phase, s.round, s.reveal >= s.matches.length, s.players.length > 0, showOut, s.demo].join('|');
    if (ck !== ctlKey) { ctlKey = ck; renderControls(); }
  }
  if (modalRefresh) modalRefresh();
  tickClock();
}

function tickClock() {
  if (!state || !refs.timer) return;
  const ms = remaining(state);
  if (ms == null) return;
  refs.timer.textContent = clock(ms);
  refs.timer.classList.toggle('low', ms < 30000);
}

// ---------------------------------------------------------------- Ansichten
function playerCard(p, opts = {}) {
  const fresh = !knownPlayers.has(p.id);
  knownPlayers.add(p.id);
  return h('div', { class: 'pcard' + (p.online ? '' : ' off') + (fresh ? ' in' : '') },
    opts.done && p.submitted ? h('span', { class: 'done', text: 'fertig' }) : null,
    figImg(p.figure), h('div', { class: 'n', text: p.name }));
}

const VIEWS = {
  lobby() {
    const url = location.origin + '/?room=' + state.code;
    let qrImg = null;
    try { const qr = qrcode(0, 'M'); qr.addData(url); qr.make(); qrImg = h('img', { class: 'qr', src: qr.createDataURL(8, 2), alt: 'QR-Code zum Beitreten' }); } catch (_) {}
    refs.grid = h('div', { class: 'pgrid scroll', style: 'flex:1' });
    refs.count = h('h2', {});
    return h('div', { class: 'cols' },
      h('div', { class: 'col' },
        h('div', { class: 'card stack' },
          h('h1', { text: 'So seid ihr dabei' }),
          h('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:nowrap;gap:2vw' },
            qrImg,
            h('div', { class: 'stack' },
              h('div', {}, h('div', { class: 'muted hand', style: 'font-size:1.4em', text: '1. Seite öffnen' }), h('div', { class: 'hand', style: 'font-size:2.2em;line-height:1.1;overflow-wrap:anywhere', text: location.host })),
              h('div', {}, h('div', { class: 'muted hand', style: 'font-size:1.4em', text: '2. Raumcode eingeben' }), h('div', { class: 'code', text: state.code })),
              h('div', { class: 'muted hand', style: 'font-size:1.4em', text: '3. Figur wählen und benennen' })))),
        state.demo ? h('div', { class: 'banner', text: 'Demo-Modus: Es ist kein ANTHROPIC_API_KEY hinterlegt. Bewertet wird nach einer einfachen Faustregel, die Prompts werden nicht ausgeführt.' }) : null),
      h('div', { class: 'col' }, refs.count, refs.grid));
  },

  writing() {
    const c = state.case;
    refs.timer = h('div', { class: 'huge timer' });
    refs.count = h('h2', {});
    refs.grid = h('div', { class: 'pgrid scroll', style: 'flex:1' });
    return h('div', { class: 'cols wide-left' },
      h('div', { class: 'col' },
        h('div', { class: 'card alt scroll stack', style: 'flex:1' },
          h('div', { class: 'muted hand', style: 'font-size:1.3em', text: 'Runde ' + state.round + ': der Case' }),
          h('h1', { text: c.titel }),
          h('p', { class: 'pre', style: 'font-size:1.25em', text: c.aufgabe }),
          c.material ? h('div', {}, h('div', { class: 'hand', style: 'font-size:1.2em', text: 'Material' }), h('div', { class: 'box pre', text: c.material })) : null)),
      h('div', { class: 'col' }, h('div', { class: 'center' }, refs.timer), refs.count, refs.grid));
  },

  judging() {
    refs.prog = h('div', { style: 'width:0%' });
    refs.progText = h('div', { class: 'muted hand', style: 'font-size:1.4em' });
    const ps = state.players;
    const a = ps[0] ? ps[Math.floor(Math.random() * ps.length)].figure : 'promptling';
    return h('div', { class: 'stage-center' },
      h('h1', { style: 'font-size:3em', text: 'Der Schiedsrichter prüft eure Prompts …' }),
      h('div', { class: 'row', style: 'justify-content:center;gap:3vw;flex-wrap:nowrap' },
        h('div', { style: 'width:22vh;animation:bob 1.3s ease-in-out infinite' }, figImg(a, 'left')),
        h('img', { src: '/img/vs.svg', alt: '', style: 'width:20vh;animation:pulse 1.2s ease-in-out infinite' }),
        h('div', { style: 'width:22vh;animation:bob 1.3s ease-in-out .5s infinite' }, figImg('halluzino', 'right'))),
      h('div', { class: 'progress' }, refs.prog), refs.progText);
  },

  reveal() {
    const ms = state.matches;
    const cur = (selected && ms.find((m) => m.id === selected && m.open)) || (state.reveal > 0 ? ms[state.reveal - 1] : null);
    let left;
    if (!cur) {
      left = h('div', { class: 'stage-center' },
        h('h1', { style: 'font-size:3em', text: 'Die Duelle sind ausgelost!' }),
        h('img', { src: '/img/vs.svg', alt: '', style: 'width:26vh;animation:pulse 1.4s ease-in-out infinite' }),
        h('p', { class: 'muted hand', style: 'font-size:1.5em', text: ms.length + (ms.length === 1 ? ' Duell' : ' Duelle') + ' in Runde ' + state.round }));
    } else {
      const animate = !seenAnim.has(cur.id);
      seenAnim.add(cur.id);
      const verdict = h('div', { class: 'card verdict', style: animate ? 'opacity:0;transition:opacity .6s' : '' },
        h('div', { class: 'row' },
          h('h2', { class: 'grow', text: cur.winner ? winnerName(cur) + ' gewinnt!' : 'Kein Sieger' }),
          cur.cheatA ? h('span', { class: 'badge orange', text: 'A: Schummelversuch erkannt' }) : null,
          cur.cheatB ? h('span', { class: 'badge orange', text: 'B: Schummelversuch erkannt' }) : null,
          cur.manual ? h('span', { class: 'badge', text: 'vom Moderator entschieden' }) : null),
        h('p', { text: cur.reason || '' }),
        cur.error ? h('p', { class: 'error', text: 'Bewertung fehlgeschlagen: ' + cur.error }) : null,
        isHost ? h('div', { class: 'row', style: 'font-size:16px' },
          h('button', { class: 'ghost', text: details ? 'Prompts ausblenden' : 'Prompts und Antworten zeigen', onclick: () => { details = !details; selected = cur.id; onState(state); } }),
          h('span', { class: 'grow' }),
          cur.walkover ? null : h('button', { class: 'ghost', text: 'Neu bewerten', onclick: (ev) => { ev.target.disabled = true; ev.target.textContent = 'Bewertung läuft …'; act('rejudge', { matchId: cur.id }); } }),
          h('button', { class: 'ghost', text: 'A gewinnt', onclick: () => act('override', { matchId: cur.id, winner: 'a' }) }),
          h('button', { class: 'ghost', text: 'B gewinnt', onclick: () => act('override', { matchId: cur.id, winner: 'b' }) })) : null);
      if (animate) setTimeout(() => { verdict.style.opacity = 1; }, 2800);
      const det = details && isHost ? h('div', { class: 'cols scroll', style: 'gap:1.2vw;flex:1;font-size:.82em' }, ['A', 'B'].map((S) => h('div', { class: 'box' },
        h('div', { class: 'hand', text: 'Prompt ' + S + ' (' + cur[S.toLowerCase()].name + ')' }), h('div', { class: 'pre', text: cur['prompt' + S] || '(nichts abgegeben)' }),
        cur['out' + S] ? h('details', {}, h('summary', { text: 'Antwort der KI' }), h('div', { class: 'pre', text: cur['out' + S] })) : null))) : null;
      left = h('div', { class: 'col', style: 'flex:1' }, det ? null : h('div', { style: 'flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0' }, duelEl(cur, { animate, big: true })), verdict, det);
    }
    return h('div', { class: 'cols wide-left' },
      h('div', { class: 'col' }, left),
      h('div', { class: 'col' },
        h('h2', { text: 'Duelle der Runde ' + state.round }),
        h('div', { class: 'mlist scroll' }, ms.map((m) => h('div', { class: 'mrow' + (m.open ? ' open' : '') + (cur && cur.id === m.id ? ' sel' : ''), onclick: m.open ? () => { selected = m.id; details = false; onState(state); } : null },
          h('span', { class: 's ' + (m.open && m.winner === 'a' ? 'win' : m.open && m.winner ? 'lose' : ''), text: m.a.name }),
          h('span', { class: 'mid', text: m.open ? 'gegen' : (isHost && m.error ? '!' : '?') }),
          h('span', { class: 's b ' + (m.open && m.winner === 'b' ? 'win' : m.open && m.winner ? 'lose' : ''), text: m.b.name })))),
        isHost && ms.some((m) => m.error) ? h('div', { class: 'banner', style: 'font-size:16px', text: 'Bei mindestens einem Duell ist die Bewertung fehlgeschlagen. Nach dem Aufdecken kannst du neu bewerten lassen oder selbst entscheiden.' }) : null));
  },

  best() {
    return h('div', { class: 'scroll', style: 'flex:1;display:flex;justify-content:center' },
      h('div', { style: 'width:min(1100px,100%);font-size:1.1em' }, state.best ? bestEl(state.best, { showOutput: showOut }) : h('h1', { class: 'center', text: 'In dieser Runde gibt es keinen besten Prompt.' })));
  },

  board() {
    const n = state.players.length;
    const b = boardEl(state.players);
    if (n > 7) { b.style.gridAutoFlow = 'column'; b.style.gridTemplateRows = 'repeat(' + Math.ceil(n / 2) + ', auto)'; b.style.gridTemplateColumns = '1fr 1fr'; b.style.columnGap = '2vw'; }
    return h('div', { class: 'col', style: 'flex:1' },
      h('h1', { text: 'Rangliste nach Runde ' + state.round + ' von ' + state.rounds }),
      h('div', { class: 'scroll', style: 'flex:1;font-size:1.1em;padding:4px 8px 8px 0' }, b),
      state.players.some((p, i) => i > 0 && p.score === state.players[i - 1].score) ? h('p', { class: 'small muted', text: TIE_NOTE }) : null);
  },

  final() {
    const ps = state.players;
    const same = (x, y) => x.score === y.score && x.bonus === y.bonus && x.quality === y.quality;
    const top = ps[0] ? ps.filter((p) => same(p, ps[0])) : [];
    const close = ps[1] && top.length === 1 && ps[1].score === ps[0].score;
    const step = (p, cls, label) => p ? h('div', { class: 'step ' + cls }, figImg(p.figure), h('div', { class: 'nm', text: p.name }), h('div', { class: 'orange', style: 'font-size:1.2em', text: p.score + (p.score === 1 ? ' Punkt' : ' Punkte') }), h('div', { class: 'blk', text: label })) : null;
    if (!celebrated) { celebrated = true; setTimeout(confetti, 300); }
    return h('div', { class: 'cols wide-left' },
      h('div', { class: 'col' },
        h('h1', { class: 'center', style: 'font-size:2.6em', text: top.length > 1 ? 'Geteilter Sieg: ' + top.map((p) => p.name).join(' und ') : ps[0] ? ps[0].name + ' gewinnt das Prompt Battle!' : 'Ende' }),
        close ? h('p', { class: 'center muted', text: 'Punktgleich mit ' + ps[1].name + '. ' + (ps[0].bonus !== ps[1].bonus ? 'Entschieden haben die Bonuspunkte.' : 'Entschieden hat die höhere Wertung des Schiedsrichters.') }) : null,
        h('div', { class: 'podium' }, step(ps[1], 'p2', '2'), step(ps[0], 'p1', '1'), step(ps[2], 'p3', '3'))),
      h('div', { class: 'col' }, h('h2', { text: 'Endstand' }), h('div', { class: 'scroll', style: 'padding:4px 8px 8px 0' }, boardEl(ps)), h('p', { class: 'small muted', text: TIE_NOTE })));
  }
};

const UPDATES = {
  lobby() {
    refs.count.textContent = state.players.length ? 'Im Raum: ' + state.players.length : 'Noch niemand im Raum';
    refs.grid.replaceChildren(...state.players.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => playerCard(p)));
  },
  writing() {
    const n = state.players.filter((p) => p.submitted).length;
    refs.count.textContent = n + ' von ' + state.players.length + ' haben abgegeben';
    refs.grid.replaceChildren(...state.players.slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => playerCard(p, { done: true })));
  },
  judging() {
    const p = state.progress;
    if (!p) return;
    refs.prog.style.width = Math.round((p.done / Math.max(1, p.total)) * 100) + '%';
    refs.progText.textContent = p.done < p.total - 1 ? p.done + ' von ' + (p.total - 1) + ' Duellen bewertet' : 'Jetzt wird der beste Prompt der Runde gekürt …';
  }
};

// ---------------------------------------------------------------- Steuerung (nur Moderator)
function renderControls() {
  const s = state;
  refs.err = h('span', { class: 'error small', style: 'min-height:0' });
  const btn = (text, fn, cls) => h('button', { class: cls || '', text, onclick: fn });
  const manage = btn('Teilnehmer verwalten', openManage, 'ghost');
  const cases = btn('Cases bearbeiten', openCases, 'ghost');
  const full = btn('Vollbild', () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }, 'ghost');
  let kids = [];
  if (s.phase === 'lobby') {
    const rounds = h('input', { type: 'number', min: 1, max: 12, value: s.rounds });
    const mins = h('input', { type: 'number', min: 0.5, max: 30, step: 0.5, value: s.seconds / 60 });
    const sendSettings = () => act('settings', { rounds: Number(rounds.value), seconds: Math.round(Number(mins.value) * 60) });
    rounds.addEventListener('change', sendSettings); mins.addEventListener('change', sendSettings);
    kids = [h('label', {}, 'Runden', rounds), h('label', {}, 'Minuten pro Runde', mins), cases, manage, full, h('span', { class: 'grow' }), refs.err,
      btn('Runde 1 starten', () => act('start'), 'primary')];
  } else if (s.phase === 'writing') {
    kids = [btn('+1 Minute', () => act('addTime'), 'ghost'), manage, full, h('span', { class: 'grow' }), refs.err, btn('Runde schließen und bewerten', () => act('close'), 'primary')];
  } else if (s.phase === 'judging') {
    kids = [h('span', { class: 'muted', text: 'Die Bewertung läuft. Das dauert je nach Teilnehmerzahl etwa 20 bis 60 Sekunden.' }), h('span', { class: 'grow' }), refs.err];
  } else if (s.phase === 'reveal') {
    const all = s.reveal >= s.matches.length;
    kids = [all ? null : btn('Alle aufdecken', () => act('revealAll'), 'ghost'), btn('Direkt zur Rangliste', () => act('board'), 'ghost'), h('span', { class: 'grow' }), refs.err,
      all ? btn('Bester Prompt der Runde', () => act('best'), 'primary') : btn('Nächstes Duell aufdecken', () => act('revealNext'), 'primary')];
  } else if (s.phase === 'best') {
    kids = [btn(showOut ? 'Antwort der KI ausblenden' : 'Antwort der KI zeigen', () => { showOut = !showOut; onState(state); }, 'ghost'), h('span', { class: 'grow' }), refs.err, btn('Rangliste zeigen', () => act('board'), 'primary')];
  } else if (s.phase === 'board') {
    const last = s.round >= s.rounds;
    kids = [manage, last ? null : cases, full, h('span', { class: 'grow' }), refs.err, btn(last ? 'Zur Siegerehrung' : 'Runde ' + (s.round + 1) + ' starten', () => act('start'), 'primary')];
  } else if (s.phase === 'final') {
    kids = [h('a', { class: 'btn', href: '/api/export?room=' + room + '&token=' + token, text: 'Ergebnisse herunterladen' }), h('span', { class: 'grow' }), refs.err, h('a', { class: 'btn', href: '/host', text: 'Neuer Raum' })];
  }
  controls.replaceChildren(...kids.filter(Boolean));
}

function modal(title, bodyEl, footer) {
  const close = () => { m.remove(); modalRefresh = null; };
  const m = h('div', { class: 'modal', onclick: (ev) => { if (ev.target === m) close(); } },
    h('div', { class: 'card stack', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'row' }, h('h2', { class: 'grow', text: title }), h('button', { class: 'ghost', text: 'Schließen', onclick: close })),
      bodyEl, footer || null));
  document.body.append(m);
  return close;
}

function openManage() {
  const body = h('div', { class: 'body' });
  const fill = () => {
    body.replaceChildren(state.players.length ? h('table', { class: 'manage' }, state.players.map((p) => h('tr', {},
      h('td', { style: 'width:3em' }, figImg(p.figure)),
      h('td', {}, h('b', { text: p.name }), h('div', { class: 'small muted', text: (p.online ? 'verbunden' : 'nicht verbunden') + ' · ' + p.wins + ' Siege, ' + p.bonus + ' Bonus' })),
      h('td', { class: 'hand', style: 'font-size:1.4rem;white-space:nowrap', text: p.score + ' P.' }),
      h('td', { style: 'white-space:nowrap;text-align:right' },
        h('button', { class: 'ghost', text: '+1', onclick: () => act('adjust', { pid: p.id, delta: 1 }) }), ' ',
        h('button', { class: 'ghost', text: '−1', onclick: () => act('adjust', { pid: p.id, delta: -1 }) }), ' ',
        h('button', { class: 'ghost', text: 'Entfernen', onclick: () => { if (confirm(p.name + ' wirklich aus dem Raum entfernen?')) act('kick', { pid: p.id }); } }))))) : h('p', { class: 'muted', text: 'Noch niemand im Raum.' }));
  };
  fill();
  modal('Teilnehmer verwalten', body);
  modalRefresh = fill;
}

function openCases() {
  const list = state.cases.map((c) => ({ ...c }));
  const body = h('div', { class: 'body' });
  const err = h('span', { class: 'error small' });
  const draw = () => {
    body.replaceChildren(
      h('p', { class: 'muted small', text: 'Gespielt werden die Cases in dieser Reihenfolge, einer pro Runde. Gibt es mehr Runden als Cases, beginnt die Liste von vorn. Das Material wird jedem Prompt beim Ausführen automatisch angehängt. Die Bewertungshinweise sieht nur der Schiedsrichter.' }),
      ...list.map((c, i) => {
        const field = (label, key, area, ph) => { const inp = area ? h('textarea', { placeholder: ph || '' }) : h('input', { type: 'text', placeholder: ph || '' }); inp.value = c[key] || ''; inp.addEventListener('input', () => { c[key] = inp.value; }); return h('div', {}, h('label', { text: label }), inp); };
        return h('div', { class: 'caseedit' },
          h('div', { class: 'row' }, h('span', { class: 'badge' + (i <= state.round - 1 ? '' : ' orange'), text: 'Runde ' + (i + 1) + (i <= state.round - 1 ? ' (gespielt)' : '') }), h('span', { class: 'grow' }),
            h('button', { class: 'ghost', text: 'nach oben', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } }),
            h('button', { class: 'ghost', text: 'nach unten', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); } }),
            h('button', { class: 'ghost', text: 'Löschen', disabled: list.length === 1, onclick: () => { list.splice(i, 1); draw(); } })),
          field('Titel', 'titel', false), field('Aufgabe (sehen alle)', 'aufgabe', true), field('Material (optional, sehen alle)', 'material', true, 'z. B. ein Text, eine Tabelle oder Notizen'), field('Bewertungshinweise (nur für den Schiedsrichter)', 'kriterien', true, 'Woran erkennt man ein gutes Ergebnis?'));
      }),
      h('button', { class: 'ghost', text: 'Case hinzufügen', disabled: list.length >= 12, onclick: () => { list.push({ titel: '', aufgabe: '', material: '', kriterien: '' }); draw(); } }));
  };
  draw();
  const close = modal('Cases bearbeiten', body, h('div', { class: 'row' }, err, h('span', { class: 'grow' }),
    h('button', { class: 'primary', text: 'Speichern', onclick: async () => {
      try { await api('/api/host/action', { room, token, action: 'cases', cases: list }); close(); } catch (e) { err.textContent = e.message; }
    } })));
}
