// Gemeinsame Helfer für Teilnehmer-, Moderator- und Beameransicht.
'use strict';

// Kreaturen und Bausteine kommen vom Server (/js/figures.js, gepflegt in lib/figures.js und lib/bausteine.js)
const FIGS = Object.fromEntries(FIGURES.map((f) => [f.id, f]));
const STUFE = ['fehlt', 'angedeutet', 'vorhanden', 'stark'];

// Anzeigename: "Tom - Halluzino"
function dn(p) { const f = p && FIGS[p.figure]; return p ? (f ? p.name + ' - ' + f.label : p.name) : ''; }

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
      h('div', { class: 'plate' }, h('span', { class: 'tag', text: key.toUpperCase() }), h('span', { class: 'n', text: dn(s) })),
      !big && m.open && m['check' + key.toUpperCase()] ? chipsEl(m['check' + key.toUpperCase()], { names: false }) : null,
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

function winnerName(m) { return m.winner ? dn(m[m.winner]) : null; }

// Baustein-Check als sechs kleine Marken: je voller, desto besser umgesetzt
// Erklärt die vier Stufen der Marken
function chipLegend() {
  return h('div', { class: 'chips legend' }, STUFE.map((t, i) => h('span', { class: 'chip l' + i }, h('span', { text: t }))));
}

function chipsEl(check, opts = {}) {
  return h('div', { class: 'chips' + (opts.big ? ' big' : '') }, BAUSTEINE.filter((b) => check.stufen[b.key] !== undefined).map((b) => {
    const st = check.stufen[b.key] || 0;
    return h('span', { class: 'chip l' + st, title: b.name + ': ' + STUFE[st] }, h('b', { text: b.nr }), opts.names === false ? null : h('span', { text: b.kurz }));
  }));
}

// Erklärung eines Bausteins (nach der Runde)
function bausteinEl(b) {
  return h('div', { class: 'stack' },
    h('div', { class: 'row', style: 'flex-wrap:nowrap;align-items:center' },
      h('div', { class: 'bfig' }, figImg(b.figur)),
      h('div', { class: 'grow' }, h('div', { class: 'muted hand', text: 'Baustein ' + b.nr + ' von 6' }), h('h1', { text: b.name }), h('div', { class: 'hand bfrage', text: b.frage }))),
    h('p', { class: 'bkern', text: b.kern }),
    h('div', { class: 'box so' }, h('div', { class: 'hand orange', text: 'So formulierst du' }), h('div', { text: b.so })),
    h('div', {}, h('div', { class: 'hand', text: 'Warum dieser Baustein wirkt' }), h('div', { text: b.warum })),
    h('div', {}, h('div', { class: 'hand', text: 'Wenn er wegfällt' }), h('div', { text: b.fehlt })));
}

function statBar(st) {
  const pct = (n) => (st.gesamt ? Math.round((n / st.gesamt) * 100) : 0);
  return h('div', { class: 'statbar', title: st.mit + ' vorhanden, ' + st.angedeutet + ' angedeutet, ' + (st.gesamt - st.mit - st.angedeutet) + ' fehlt' },
    h('div', { class: 'full', style: 'width:' + pct(st.mit) + '%' }), h('div', { class: 'half', style: 'width:' + pct(st.angedeutet) + '%' }));
}

// Abschluss: der Qualitätscheck aus dem Training
function qcEl(check, big) {
  return h('div', { class: 'stack' },
    h(big ? 'h2' : 'h3', { text: 'Und danach: drei Blicke auf jedes KI-Ergebnis' }),
    h('div', { class: 'qc' }, check.map((c) => h('div', {}, h('div', { class: 'hand orange qct', text: c.titel }), h('div', { style: 'font-weight:600', text: c.frage }), h('ul', {}, c.punkte.map((x) => h('li', { text: x })))))),
    h('p', { class: 'muted', text: 'Der beste Prompt ersetzt nicht den Blick auf das Ergebnis.' }));
}

// Vergleich ohne und mit Baustein: Was beide Prompts gemeinsam haben, steht grau, das Neue ist markiert.
// Die Vergleichs-Prompts wachsen von Runde zu Runde, deshalb lässt sich der gemeinsame Teil kürzen (kurz: true).
function vergleichEl(v, opts = {}) {
  const A = v.ohne.split(/(\s+)/), B = v.mit.split(/(\s+)/);
  let i = 0;
  while (i < A.length && i < B.length && A[i] === B[i]) i++;
  let j = 0;
  while (j < A.length - i && j < B.length - i && A[A.length - 1 - j] === B[B.length - 1 - j]) j++;
  let pre = A.slice(0, i).join(''), post = j ? A.slice(A.length - j).join('') : '';
  const a = A.slice(i, A.length - j).join(''), b = B.slice(i, B.length - j).join('');
  if (opts.kurz && pre.length > 220) pre = '[…] ' + pre.slice(-130).replace(/^\S*\s+/, '');
  // ein Kasten: grau = in beiden Prompts gleich, durchgestrichen = nur ohne den Baustein, markiert = neu mit dem Baustein
  return h('div', { class: 'vergleich' },
    h('div', { class: 'legende' }, h('span', {}, h('span', { class: 'neu', text: 'markiert' }), ' mit dem Baustein'), a ? h('span', {}, h('span', { class: 'alt', text: 'durchgestrichen' }), ' ohne den Baustein') : null),
    h('div', { class: 'box pre' },
      pre ? h('span', { class: 'gleich', text: pre }) : null,
      a ? h('span', { class: 'alt', text: a }) : null, a && b ? ' ' : null,
      b ? h('span', { class: 'neu', text: b }) : null,
      post ? h('span', { class: 'gleich', text: post }) : null));
}

// Frage an die Runde
function debriefEl(text) {
  return h('div', { class: 'debrief' }, h('div', { class: 'hand orange', text: 'Frage an die Runde' }), h('div', { text: text }));
}

// Der ganze Baukasten als Leiste: was schon erklärt wurde, ist ausgefüllt
function baukastenEl(list) {
  return h('div', { class: 'bkstrip' }, list.map((b) => h('div', { class: 'bk' + (b.gelernt ? ' done' : '') + (b.aktuell ? ' now' : '') }, h('b', { text: b.nr }), b.name === '?' ? '' : ' ' + b.name)));
}

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
      h('div', { class: 'nm' }, dn(p), h('div', { class: 'sub', text: p.wins + (p.wins === 1 ? ' Sieg' : ' Siege') + (p.bonus ? ', ' + p.bonus + ' Bonus' : '') + (tie && p.quality ? ' · Wertung ' + p.quality : '') })),
      h('div', { class: 'pts', text: p.score + (p.score === 1 ? ' Punkt' : ' Punkte') }));
  }));
}

function bestEl(best, { showOutput = false } = {}) {
  return h('div', { class: 'card accent' },
    h('div', { class: 'row' },
      h('div', { style: 'width:5.2em;flex:none' }, figImg(best.figure)),
      h('div', { class: 'grow' }, h('div', { class: 'muted hand', text: 'Bester Prompt der Runde' }), h('h2', { text: dn(best) })),
      h('span', { class: 'badge orange', text: '+1 Bonuspunkt' })),
    h('div', { class: 'box pre', style: 'margin-top:10px', text: best.prompt }),
    best.reason ? h('p', {}, h('b', { text: 'Warum: ' }), best.reason) : null,
    best.learn ? h('p', {}, h('b', { class: 'orange', text: 'Zum Mitnehmen: ' }), best.learn) : null,
    best.check ? chipsEl(best.check) : null,
    showOutput && best.output ? h('details', { open: true }, h('summary', { text: 'Antwort der KI' }), h('div', { class: 'pre small', text: best.output })) : null);
}

const TIE_NOTE = 'Bei gleicher Punktzahl entscheiden zuerst die Bonuspunkte, dann die Wertung: die Summe der Punkte, die der Schiedsrichter den Prompts gegeben hat.';

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
