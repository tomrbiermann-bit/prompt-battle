// Gemeinsame Helfer für Teilnehmer-, Moderator- und Beameransicht.
'use strict';

const FIGS = {
  promptling: { label: 'Promptling', hint: 'flink und präzise', faces: 'r' },
  kontextor: { label: 'Kontextor', hint: 'hat immer Kontext dabei', faces: 'r' },
  halluzino: { label: 'Halluzino', hint: 'erfindet gern Dinge', faces: 'l' },
  rollux: { label: 'Rollux', hint: 'schlüpft in jede Rolle', faces: 'r' }
};

// Elemente bauen, ohne je Nutzertexte als HTML zu interpretieren
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}

async function api(path, body) {
  let res;
  try {
    res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  } catch (_) { throw new Error('Keine Verbindung zum Server.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Das hat nicht geklappt.');
  return data;
}

// Live-Verbindung. Der Browser verbindet sich bei Abbrüchen selbst neu.
let skew = 0;
function connect(query, onState, onLost) {
  const es = new EventSource('/api/events?' + query);
  let fails = 0;
  es.onmessage = (ev) => { fails = 0; const s = JSON.parse(ev.data); skew = s.now - Date.now(); onState(s); };
  es.onerror = () => { if (++fails === 3 && onLost) onLost(); };
  return es;
}
setInterval(() => { fetch('/api/ping').catch(() => {}); }, 60000); // hält den Dienst wach

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} }
};

function figImg(figure, side) {
  const f = FIGS[figure] || FIGS.promptling;
  const flip = (side === 'left' && f.faces === 'l') || (side === 'right' && f.faces === 'r');
  return h('img', { class: 'figure' + (flip ? ' flip' : ''), src: '/img/' + (FIGS[figure] ? figure : 'promptling') + '.svg', alt: f.label, draggable: 'false' });
}

function hpBar(v) {
  const fill = h('div', { class: 'fill', style: '--v:' + v });
  const el = h('div', { class: 'hp' }, fill, h('img', { src: '/img/lebensbalken-leer.svg', alt: '' }));
  el.set = (x) => fill.style.setProperty('--v', Math.max(0, Math.min(1, x)));
  return el;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function hpAfter(m) {
  if (!m.winner) return { a: 0.5, b: 0.5 };
  if (m.walkover) return m.winner === 'a' ? { a: 1, b: 0 } : { a: 0, b: 1 };
  const ws = m.winner === 'a' ? m.scoreA : m.scoreB, ls = m.winner === 'a' ? m.scoreB : m.scoreA;
  const w = clamp(1 - ls * 0.0045, 0.4, 0.95), l = clamp(1 - ws / 100, 0.05, 0.28);
  return m.winner === 'a' ? { a: w, b: l } : { a: l, b: w };
}

// Kampfszene: zwei Figuren, VS, Lebensbalken. animate=true spielt den Kampf ab.
function duelEl(m, { animate = false, big = false } = {}) {
  const side = (key, pos) => {
    const s = m[key];
    const hp = hpBar(1);
    const el = h('div', { class: 'fighter ' + pos },
      hp,
      h('div', { class: 'plate' }, h('span', { class: 'tag', text: key.toUpperCase() }), h('span', { class: 'n', text: s.name })),
      h('div', { class: 'figwrap' }, h('div', { class: 'crown', text: 'Sieg!' }), figImg(s.figure, pos)));
    el.hp = hp;
    return el;
  };
  const A = side('a', 'left'), B = side('b', 'right');
  const el = h('div', { class: 'duel' + (big ? ' bigduel' : '') }, A, h('img', { class: 'vs', src: '/img/vs.svg', alt: 'gegen' }), B);
  if (m.open) {
    const end = hpAfter(m);
    const finish = () => {
      A.hp.set(end.a); B.hp.set(end.b);
      if (m.winner) { (m.winner === 'a' ? A : B).classList.add('winner'); (m.winner === 'a' ? B : A).classList.add('loser'); }
    };
    if (animate) {
      setTimeout(() => { A.classList.add('hit'); B.classList.add('hit'); A.hp.set((1 + end.a) / 2); B.hp.set((1 + end.b) / 2); }, 500);
      setTimeout(() => { A.hp.set(end.a); B.hp.set(end.b); }, 1500);
      setTimeout(finish, 2700);
    } else finish();
  }
  return el;
}

function winnerName(m) { return m.winner ? m[m.winner].name : null; }

function boardEl(players, meId, limit) {
  const list = limit ? players.slice(0, limit) : players;
  // Reihenfolge: Punkte, dann Bonuspunkte, dann Wertung des Schiedsrichters. Gleicher Platz nur bei völligem Gleichstand.
  let rank = 0, last = null;
  const tie = list.some((p, i) => i > 0 && p.score === list[i - 1].score);
  return h('div', { class: 'board' }, list.map((p, i) => {
    const sig = p.score + '|' + p.bonus + '|' + p.quality;
    if (sig !== last) { rank = i + 1; last = sig; }
    return h('div', { class: 'line' + (p.id === meId ? ' me' : '') + (rank === 1 ? ' first' : '') },
      h('div', { class: 'rank', text: rank + '.' }),
      figImg(p.figure),
      h('div', { class: 'nm' }, p.name, h('div', { class: 'sub', text: p.wins + (p.wins === 1 ? ' Sieg' : ' Siege') + (p.bonus ? ', ' + p.bonus + ' Bonus' : '') + (tie && p.quality ? ' · Wertung ' + p.quality : '') })),
      h('div', { class: 'pts', text: p.score + (p.score === 1 ? ' Punkt' : ' Punkte') }));
  }));
}

function bestEl(best, { showOutput = false } = {}) {
  return h('div', { class: 'card accent' },
    h('div', { class: 'row' },
      h('div', { style: 'width:5.2em;flex:none' }, figImg(best.figure)),
      h('div', { class: 'grow' }, h('div', { class: 'muted hand', text: 'Bester Prompt der Runde' }), h('h2', { text: best.name })),
      h('span', { class: 'badge orange', text: '+1 Bonuspunkt' })),
    h('div', { class: 'box pre', style: 'margin-top:10px', text: best.prompt }),
    best.reason ? h('p', {}, h('b', { text: 'Warum: ' }), best.reason) : null,
    best.learn ? h('p', {}, h('b', { class: 'orange', text: 'Zum Mitnehmen: ' }), best.learn) : null,
    showOutput && best.output ? h('details', { open: true }, h('summary', { text: 'Antwort der KI' }), h('div', { class: 'pre small', text: best.output })) : null);
}

const TIE_NOTE = 'Bei gleicher Punktzahl entscheiden zuerst die Bonuspunkte, dann die Wertung: die Summe der Punkte, die der Schiedsrichter deinen Prompts gegeben hat.';

function remaining(state) { return state.deadline ? Math.max(0, state.deadline - (Date.now() + skew)) : null; }
function clock(ms) { const s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 90; i++) {
    const c = h('div', { class: 'confetti', style: `left:${Math.random() * 100}vw;background:${i % 3 ? '#f36f2f' : '#464e52'};animation-duration:${2.5 + Math.random() * 3}s;animation-delay:${Math.random() * 2}s;opacity:${0.6 + Math.random() * 0.4}` });
    document.body.append(c);
    setTimeout(() => c.remove(), 8000);
  }
}
