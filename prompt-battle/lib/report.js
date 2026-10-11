// Persönlicher Bericht als PDF: alle Prompts eines Teilnehmers mit Ergebnis, Baustein-Check, Urteil, Stärke und Tipp.
// Gebaut mit pdfkit (einzige externe Abhängigkeit der App, installiert über "npm install").
// Fehlt die Bibliothek, läuft das Spiel trotzdem, nur der Bericht ist dann nicht verfügbar.
const fs = require('fs');
const path = require('path');
const rubrik = require('./rubrik');
const { BAUSTEINE, QUALITAETSCHECK, byKey, ALLE } = require('./bausteine');
const { labelOf, displayName } = require('./figures');

let PDFDocument = null, fontkit = null;
try { PDFDocument = require('pdfkit'); fontkit = require('fontkit'); } catch (_) { /* Bericht nicht verfügbar */ }

const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
const IMG = path.join(__dirname, '..', 'public', 'img');
const INK = '#464e52', SOFT = '#6d767a', ORANGE = '#f36f2f', ORANGE_SOFT = '#fde6da', BOX = '#f4f1ea', LINE = '#dcd8cf';
const STUFE = ['fehlt', 'angedeutet', 'vorhanden', 'stark'];
const BOT = 'bot';

const available = () => !!PDFDocument;

// ---------------------------------------------------------------- Daten zusammenstellen
// Enthält nur Runden, deren Duelle schon aufgedeckt sind.
function collect(room, pid, ranking) {
  const p = room.players[pid];
  if (!p) return null;
  const rank = ranking.findIndex((x) => x.id === pid) + 1;
  const runden = [];
  room.rounds.forEach((r, i) => {
    const fertig = i < room.roundIndex || ['best', 'board', 'final'].includes(room.phase) || (room.phase === 'lesson' && r.revealed);
    if (!fertig) return;
    const m = r.matches.find((x) => x.a === pid || x.b === pid);
    const fokus = r.case.fokus;
    const eintrag = { nr: i + 1, titel: r.case.titel, aufgabe: r.case.aufgabe, baustein: fokus === ALLE ? null : byKey[fokus] || null, final: fokus === ALLE, dabei: !!m };
    if (m) {
      const S = m.a === pid ? 'A' : 'B', O = S === 'A' ? 'B' : 'A', s = S.toLowerCase(), o = O.toLowerCase();
      const v = m.verdict || {};
      const gegner = m[o] === BOT ? 'Hausgegner (' + labelOf(m[o + 'Figure']) + ')' : displayName(m[o + 'Name'], m[o + 'Figure']);
      Object.assign(eintrag, {
        seite: S, gegner, prompt: m['prompt' + S] || '', antwort: m['out' + S] || '',
        sieg: v.winner === s, keinSieger: !v.winner, kampflos: !!m.walkover, manuell: !!m.manual,
        punkte: v['score' + S] || 0, punkteGegner: v['score' + O] || 0,
        urteil: v.reason || '', staerke: v['strength' + S] || '', tipp: v['tip' + S] || '', schummel: !!v['cheat' + S],
        check: rubrik.sicht(m['check' + S], true), bester: !!(r.best && r.best.pid === pid)
      });
    }
    runden.push(eintrag);
  });
  return {
    name: p.name, figure: p.figure, anzeige: displayName(p.name, p.figure), kreatur: labelOf(p.figure),
    platz: rank, von: ranking.length, punkte: p.score, siege: p.wins, bonus: p.bonus,
    raum: room.code, datum: new Date(room.createdAt), fertig: room.phase === 'final', runden
  };
}

// ---------------------------------------------------------------- Zeichnen
const A4 = { w: 595.28, h: 841.89 };
const M = 46;                 // Seitenrand
const W = A4.w - 2 * M;       // nutzbare Breite
const BOTTOM = A4.h - 54;     // darunter steht die Fußzeile

function figurePaths(figure) {
  try {
    const svg = fs.readFileSync(path.join(IMG, figure + '.svg'), 'utf8');
    return [...svg.matchAll(/<path class="(st0|st1)" d="([^"]+)"/g)].map(([, cls, d]) => ({ d, color: cls === 'st0' ? INK : ORANGE }));
  } catch (_) { return []; }
}

function build(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M, bufferPages: true, info: { Title: 'Prompt Battle: Bericht für ' + data.anzeige, Author: 'Prompt Battle' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const files = { hand: 'PatrickHand-Regular.ttf', body: 'LiberationSans-Regular.ttf', bold: 'LiberationSans-Bold.ttf' };
    const fk = {};
    for (const [k, f] of Object.entries(files)) { const buf = fs.readFileSync(path.join(FONTS, f)); doc.registerFont(k, buf); fk[k] = fontkit.create(buf); }
    // Zeichen, die eine Schrift nicht kennt (zum Beispiel Emojis), würden als Kästchen erscheinen: weglassen
    const kann = (font, ch) => ch === '\n' || fk[font].hasGlyphForCodePoint(ch.codePointAt(0));
    const clean = (t, font = 'body') => [...String(t == null ? '' : t).replace(/\r/g, '').replace(/\t/g, ' ').replace(/[​-‏️]/g, '')].filter((ch) => kann(font, ch)).join('');
    // Handschrift für Überschriften und Namen. Kennt sie ein Zeichen nicht, springt die fette Textschrift ein.
    const handFont = (t) => ([...String(t)].every((ch) => kann('hand', ch)) ? 'hand' : 'bold');

    const space = () => BOTTOM - doc.y;
    const ensure = (h) => { if (h > space()) { doc.addPage(); doc.y = M; } };
    const gap = (h) => { doc.y += h; };

    function hand(text, size, color = INK, opts = {}) {
      const f = handFont(text);
      doc.font(f).fontSize(f === 'hand' ? size : size * 0.8).fillColor(color).text(clean(text, f), opts.x == null ? M : opts.x, opts.y == null ? doc.y : opts.y, { width: opts.width || W, align: opts.align || 'left', lineGap: 0 });
    }
    function para(text, opts = {}) {
      doc.font(opts.bold ? 'bold' : 'body').fontSize(opts.size || 10).fillColor(opts.color || INK)
        .text(clean(text), opts.x == null ? M : opts.x, opts.y == null ? doc.y : opts.y, { width: opts.width || W, lineGap: 2.2, align: opts.align || 'left' });
    }
    // Absatz mit fettem Vorspann in derselben Zeile ("Urteil: ...")
    function labeled(label, text, color = INK) {
      doc.font('bold').fontSize(10).fillColor(color).text(clean(label) + ' ', M, doc.y, { width: W, lineGap: 2.2, continued: true });
      doc.font('body').fillColor(INK).text(clean(text), { width: W, lineGap: 2.2 });
    }
    const hoehe = (text, width, size = 10, font = 'body') => doc.font(font).fontSize(size).heightOfString(clean(text) || ' ', { width, lineGap: 2.2 });

    // Kasten mit Text. Passt er auf keine Seite mehr am Stück, läuft der Text ohne Kasten über den Seitenumbruch.
    function textBox(label, text, opts = {}) {
      const pad = 9, inner = W - 2 * pad, size = opts.size || 9.5;
      const h = hoehe(text, inner, size) + 2 * pad;
      const kopf = 17;
      if (kopf + h <= BOTTOM - M) {
        ensure(kopf + h + 4);
        hand(label, 13, opts.labelColor || INK);
        const y = doc.y + 1;
        doc.roundedRect(M, y, W, h, 7).fillAndStroke(opts.fill || BOX, opts.stroke || LINE);
        para(text, { x: M + pad, y: y + pad, width: inner, size });
        doc.y = y + h + 8;
      } else {
        ensure(60);
        hand(label, 13, opts.labelColor || INK);
        para(text, { size });
        gap(8);
      }
    }

    // Marken des Baustein-Checks. Rückgabe: Höhe der gezeichneten Zeilen
    function chips(check, x0, y0, maxW, withNames = true) {
      let x = x0, y = y0;
      const h = 15, size = 8.5;
      for (const b of BAUSTEINE) {
        const st = check.stufen[b.key];
        if (st === undefined) continue;
        const label = withNames ? b.nr + ' ' + b.kurz : String(b.nr);
        const w = doc.font('body').fontSize(size).widthOfString(label) + 14;
        if (x + w > x0 + maxW) { x = x0; y += h + 4; }
        chip(label, x, y, w, h, st, size);
        x += w + 4;
      }
      return y + h - y0;
    }
    function chip(label, x, y, w, h, st, size = 8.5) {
      doc.lineWidth(1);
      if (st === 3) doc.roundedRect(x, y, w, h, h / 2).fillAndStroke(ORANGE, ORANGE);
      else if (st === 2) doc.roundedRect(x, y, w, h, h / 2).fillAndStroke(ORANGE_SOFT, ORANGE);
      else if (st === 1) { doc.roundedRect(x, y, w, h, h / 2).dash(2.5, { space: 2 }).fillAndStroke('#ffffff', ORANGE); doc.undash(); }
      else { doc.roundedRect(x, y, w, h, h / 2).dash(2.5, { space: 2 }).stroke('#c3c7c9'); doc.undash(); }
      doc.font('body').fontSize(size).fillColor(st === 3 ? '#ffffff' : st === 0 ? '#a3a9ac' : INK).text(label, x, y + (h - size) / 2 - 0.6, { width: w, align: 'center', lineBreak: false });
    }
    function legende(x, y) {
      let xx = x;
      STUFE.forEach((t, i) => { const w = doc.font('body').fontSize(7.5).widthOfString(t) + 12; chip(t, xx, y, w, 13, i, 7.5); xx += w + 4; });
      return xx - x;
    }
    function badge(text, x, y, filled) {
      const f = handFont(text), size = 12;
      const w = doc.font(f).fontSize(size).widthOfString(text) + 18, h = 19;
      if (filled) doc.roundedRect(x - w, y, w, h, h / 2).fill(ORANGE); else doc.lineWidth(1.2).roundedRect(x - w, y, w, h, h / 2).stroke(INK);
      doc.font(f).fontSize(size).fillColor(filled ? '#ffffff' : INK).text(text, x - w, y + 2.2, { width: w, align: 'center', lineBreak: false });
      return w;
    }
    const trenner = () => { doc.lineWidth(1).moveTo(M, doc.y).lineTo(M + W, doc.y).dash(4, { space: 3 }).stroke(LINE); doc.undash(); };

    // ------------------------------------------------ Kopf
    doc.font('hand').fontSize(17).fillColor(ORANGE).text('>_ ', M, M - 8, { continued: true }).fillColor(INK).text('Prompt Battle');
    doc.font('body').fontSize(9).fillColor(SOFT).text('Raum ' + data.raum + ' · ' + data.datum.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }), M, M - 2, { width: W, align: 'right' });

    const top = M + 22, fig = 118;
    doc.lineWidth(2).roundedRect(M, top, W, fig + 20, 14).stroke(ORANGE);
    doc.save().translate(M + 12, top + 10).scale(fig / 360);
    for (const p of figurePaths(data.figure)) doc.path(p.d).fill(p.color);
    doc.restore();
    const tx = M + fig + 28, tw = W - fig - 44;
    hand('Dein Bericht', 14, SOFT, { x: tx, y: top + 22, width: tw });
    // lange Namen kleiner setzen, damit sie in eine Zeile passen
    const nf = handFont(data.anzeige);
    let ns = 30;
    while (ns > 15 && doc.font(nf).fontSize(nf === 'hand' ? ns : ns * 0.8).widthOfString(clean(data.anzeige, nf)) > tw) ns -= 1;
    hand(data.anzeige, ns, INK, { x: tx, width: tw });
    const gespielt = data.runden.filter((r) => r.dabei).length;
    const zeile = (data.fertig ? 'Platz ' + data.platz + ' von ' + data.von + ' · ' : '') + data.punkte + (data.punkte === 1 ? ' Punkt' : ' Punkte') +
      ' (' + data.siege + (data.siege === 1 ? ' Sieg' : ' Siege') + (data.bonus ? ', ' + data.bonus + ' Bonus für den besten Prompt' : '') + ') · ' + gespielt + (gespielt === 1 ? ' Runde' : ' Runden');
    para(zeile, { x: tx, y: doc.y + 4, width: tw, size: 11 });
    doc.y = top + fig + 20 + 16;

    // ------------------------------------------------ Verlauf im Baukasten
    const mit = data.runden.filter((r) => r.dabei && r.check);
    if (mit.length) {
      hand('Dein Baukasten im Verlauf', 18);
      para('Jede Runde hat einen Baustein dazugebracht. Die Marken zeigen, wie gut er in deinem Prompt umgesetzt war. Gewertet wurden jeweils nur die Bausteine, die schon dran waren.', { size: 9.5, color: SOFT });
      gap(6);
      const lw = 190;
      for (const r of mit) {
        ensure(24);
        const y = doc.y;
        doc.font('body').fontSize(9.5).fillColor(INK).text(clean('Runde ' + r.nr + ': ' + r.titel), M, y + 2.5, { width: lw - 8, lineBreak: false, ellipsis: true });
        const hh = chips(r.check, M + lw, y, W - lw, false);
        const erg = r.kampflos ? (r.sieg ? 'kampflos' : 'nichts abgegeben') : r.keinSieger ? 'kein Sieger' : r.sieg ? 'Sieg' : 'Niederlage';
        doc.font(r.sieg ? 'bold' : 'body').fontSize(9.5).fillColor(r.sieg ? ORANGE : SOFT).text(erg + (r.bester ? ' + Bonus' : ''), M + W - 130, y + 2.5, { width: 130, align: 'right', lineBreak: false });
        doc.y = y + Math.max(hh, 15) + 6;
      }
      const y = doc.y + 2;
      doc.font('body').fontSize(8).fillColor(SOFT).text('Stufen:', M + lw, y + 2.5, { lineBreak: false });
      legende(M + lw + 34, y);
      doc.font('body').fontSize(8).fillColor(SOFT).text(BAUSTEINE.map((b) => b.nr + ' ' + b.name).join(' · '), M, y + 20, { width: W });
      gap(14);
    }

    // ------------------------------------------------ Runden
    for (const r of data.runden) {
      ensure(150);
      trenner();
      gap(10);
      const y0 = doc.y;
      let bw = 0;
      if (r.dabei) {
        const erg = r.kampflos ? (r.sieg ? 'Kampfloser Sieg' : 'Nichts abgegeben') : r.keinSieger ? 'Kein Sieger' : r.sieg ? 'Sieg' : 'Niederlage';
        bw = badge(erg, M + W, y0 + 4, r.sieg);
        if (r.bester) bw += 6 + badge('Bester Prompt +1', M + W - bw - 6, y0 + 4, true);
      }
      hand('Runde ' + r.nr + ': ' + r.titel, 18, INK, { width: W - bw - 10 });
      if (!r.dabei) { para('In dieser Runde warst du noch nicht dabei.', { color: SOFT }); gap(10); continue; }
      const teile = ['gegen ' + r.gegner];
      if (!r.kampflos) teile.push('Wertung ' + r.punkte + ' zu ' + r.punkteGegner);
      teile.push(r.final ? 'alle sechs Bausteine' : r.baustein ? 'Baustein der Runde: ' + r.baustein.name : '');
      if (r.manuell) teile.push('von der Moderation entschieden');
      para(teile.filter(Boolean).join(' · '), { size: 9.5, color: SOFT });
      gap(6);

      textBox('Dein Prompt', r.prompt || '(nichts abgegeben)');

      if (r.check) {
        ensure(40);
        const y = doc.y;
        hand('Baustein-Check: ' + r.check.anzahl + ' von ' + r.check.gesamt, 13, INK, { width: 150 });
        const hh = chips(r.check, M + 150, y + 1, W - 150, true);
        doc.y = y + Math.max(hh, 16) + 8;
      }
      if (r.urteil) {
        ensure(46);
        labeled('Urteil' + (r.kampflos ? ':' : ' (du warst Prompt ' + r.seite + '):'), r.urteil);
        gap(5);
      }
      if (r.schummel) { ensure(30); para('Der Schiedsrichter hat einen Beeinflussungsversuch in deinem Prompt bemerkt.', { color: ORANGE, bold: true }); gap(5); }
      if (r.staerke) { ensure(34); labeled('Deine Stärke:', r.staerke); gap(5); }
      if (r.tipp) { ensure(34); labeled('Tipp für dich:', r.tipp, ORANGE); gap(5); }
      // Die KI antwortet oft mit Markdown. Fettmarken und Überschriftenzeichen stören im Bericht nur.
      if (r.antwort) { gap(3); textBox('Antwort der KI auf deinen Prompt', r.antwort.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, ''), { fill: '#ffffff', size: 9 }); }
      if (r.baustein) {
        ensure(30);
        para('So formulierst du den Baustein ' + r.baustein.name + ': ' + r.baustein.so, { size: 9, color: SOFT });
      }
      gap(12);
    }

    // ------------------------------------------------ Baukasten zum Mitnehmen
    const zeigen = data.fertig ? BAUSTEINE : BAUSTEINE.filter((b) => data.runden.some((r) => r.final || (r.baustein && r.baustein.key === b.key)));
    if (zeigen.length) {
      ensure(110 + zeigen.length * 42);
      trenner();
      gap(10);
      hand('Der Prompt-Baukasten zum Mitnehmen', 18);
      gap(4);
      for (const b of zeigen) {
        const h1 = hoehe(b.frage + ' ' + b.so, W - 150, 9.5) + 4;
        ensure(h1 + 8);
        const y = doc.y;
        chip(b.nr + ' ' + b.name, M, y, 132, 17, 2, 9);
        doc.font('bold').fontSize(9.5).fillColor(INK).text(clean(b.frage) + ' ', M + 146, y + 2, { width: W - 146, lineGap: 2.2, continued: true });
        doc.font('body').text(clean(b.so), { width: W - 146, lineGap: 2.2 });
        doc.y = Math.max(doc.y, y + 17) + 7;
      }
      if (data.fertig) {
        gap(8);
        ensure(130);
        hand('Und danach: drei Blicke auf jedes KI-Ergebnis', 15);
        gap(4);
        const cw = (W - 24) / 3, y = doc.y;
        let maxY = y;
        QUALITAETSCHECK.forEach((c, i) => {
          const x = M + i * (cw + 12);
          doc.font('hand').fontSize(14).fillColor(ORANGE).text(c.titel, x, y, { width: cw });
          doc.font('bold').fontSize(9).fillColor(INK).text(c.frage, x, doc.y, { width: cw });
          doc.font('body').fontSize(9).fillColor(INK);
          for (const pkt of c.punkte) doc.text('• ' + pkt, x, doc.y + 1.5, { width: cw });
          maxY = Math.max(maxY, doc.y);
        });
        doc.y = maxY + 8;
        para('Der beste Prompt ersetzt nicht den Blick auf das Ergebnis.', { size: 9.5, color: SOFT });
      }
    }

    // ------------------------------------------------ Fußzeilen
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.page.margins.bottom = 0; // sonst erzeugt Text im Fußbereich eine neue Seite
      doc.font('body').fontSize(8).fillColor(SOFT).text(clean('Prompt Battle · ' + data.anzeige), M, A4.h - 36, { width: W / 2, lineBreak: false });
      doc.text('Seite ' + (i + 1) + ' von ' + range.count, M + W / 2, A4.h - 36, { width: W / 2, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}

// Dateiname ohne Sonderzeichen
const fileName = (data) => 'prompt-battle-bericht-' + (data.name.replace(/ß/g, 'ss').replace(/[łŁ]/g, 'l').replace(/[øØ]/g, 'o').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'teilnehmer') + '.pdf';

module.exports = { available, collect, build, fileName };
