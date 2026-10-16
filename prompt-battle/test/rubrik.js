// Prüft die Standardbewertung (Baustein-Check) gegen bekannte Prompt-Paare.
// Start: node test/rubrik.js        (mit -v werden alle Analysen ausgegeben)
const assert = require('assert');
const { DEFAULT_CASES: ROH } = require('../lib/cases');
const { KEYS } = require('../lib/bausteine');
const R = require('../lib/rubrik');
const { byKey } = require('../lib/bausteine');
// wie im Spiel: In Runde n sind die Bausteine der Runden 1 bis n bekannt
const DEFAULT_CASES = ROH.map((c, i) => ({ ...c, bekannt: R.bekanntBis(ROH.slice(0, i + 1)) }));

const verbose = process.argv.includes('-v');
const zeile = (a) => KEYS.map((k) => k.slice(0, 4) + ':' + a.stufen[k] + (a.bekannt.includes(k) ? '' : '°')).join(' ') + ' | Fakten ' + a.fakten.treffer + '/' + a.fakten.total + ' | Technik ' + a.technik.length + ' | ' + a.punkte + ' P.';
let n = 0;
const ok = (cond, msg) => { n++; assert.ok(cond, msg); };

// 1. Die Vergleichs-Prompts jedes Cases: "mit Baustein" muss "ohne Baustein" schlagen, und zwar beim Baustein der Runde.
for (const c of DEFAULT_CASES) {
  const ohne = R.analyse(c.ohne, c), mit = R.analyse(c.mit, c);
  const v = R.duell(ohne, mit, c);
  if (verbose) console.log('\n' + c.titel + ' (Fokus ' + c.fokus + ')\n  ohne: ' + zeile(ohne) + '\n  mit:  ' + zeile(mit) + '\n  ' + v.reason + '\n  Tipp ohne: ' + v.tipA + '\n  Stärke mit: ' + v.strengthB);
  ok(v.winner === 'B', c.titel + ': der Prompt mit Baustein muss gewinnen');
  ok(v.scoreB - v.scoreA >= 8, c.titel + ': der Abstand sollte deutlich sein (' + v.scoreA + ' zu ' + v.scoreB + ')');
  if (c.fokus !== 'alle') {
    ok(mit.stufen[c.fokus] >= 2, c.titel + ': Baustein ' + c.fokus + ' muss im starken Prompt erkannt werden');
    ok(ohne.stufen[c.fokus] <= 1, c.titel + ': Baustein ' + c.fokus + ' darf im schwachen Prompt höchstens angedeutet sein');
    ok(v.reason.includes('Baustein ' + byKey[c.fokus].name), c.titel + ': Begründung nennt den Baustein der Runde');
  } else {
    ok(mit.bekannt.length === 6, 'Final Case: alle Bausteine sind bekannt');
    ok(mit.anzahl === 6, 'Final Case: der Muster-Prompt muss alle sechs Bausteine haben, hat ' + mit.anzahl);
    ok(ohne.anzahl <= 2, 'Final Case: der schwache Prompt hat höchstens zwei Bausteine, hat ' + ohne.anzahl);
  }
}

// 1b. Nichts vorwegnehmen: In Runde n kommen in Urteil, Stärke, Tipp und bestem Prompt nur die Bausteine 1 bis n vor.
const REICH = 'Du arbeitest in der Kommunikation der Stadtwerke und prüfst jeden Satz darauf, ob ihn ein Laie versteht. Fasse das Material zusammen. Kontext: Das Ergebnis geht morgen an die Geschäftsführung, die wenig Zeit hat. Nenne unbedingt Termine und Zahlen, aber keine Namen. Format: Tabelle und danach maximal 3 Stichpunkte. Qualitätskriterien: verständlich ohne Fachbegriffe, erfinde nichts dazu.';
const PROBEN = [REICH, 'Mach das gut und professionell.', 'Schreibe einen Text dazu.', 'Du bist Experte. Erstelle eine Tabelle mit maximal 5 Zeilen, verständlich ohne Fachbegriffe, nenne keine Namen.', 'Brief'];
DEFAULT_CASES.forEach((c, i) => {
  const spaeter = KEYS.filter((k) => !c.bekannt.includes(k)).map((k) => byKey[k].name);
  ok(c.fokus === 'alle' ? spaeter.length === 0 : spaeter.length === 5 - i, c.titel + ': bekannte Bausteine stimmen nicht');
  const texte = [];
  for (const p of PROBEN) for (const g of PROBEN) {
    const a = R.analyse(p, c), b = R.analyse(g, c), v = R.duell(a, b, c), best = R.bester(a, c);
    texte.push(v.reason, v.strengthA, v.strengthB, v.tipA, v.tipB, best.reason, best.learn);
    ok(Object.keys(R.sicht(R.kurz(a), true).stufen).every((k) => c.bekannt.includes(k)), c.titel + ': Marken zeigen einen unbekannten Baustein');
  }
  // Zitate aus Prompts dürfen die Wörter enthalten, die Texte des Schiedsrichters nicht
  const ohneZitate = texte.join(' | ').replace(/"[^"]*"/g, '""');
  for (const name of spaeter) ok(!new RegExp('\\b' + name + '\\b').test(ohneZitate), c.titel + ': Text nimmt den Baustein ' + name + ' vorweg: ' + (ohneZitate.match(new RegExp('.{0,80}\\b' + name + '\\b.{0,40}')) || [''])[0]);
});
// Ein Prompt, der nur spätere Bausteine hat, bekommt dafür in Runde 1 keine Punkte
ok(R.analyse('Erstelle eine Tabelle mit maximal 5 Zeilen, verständlich ohne Fachbegriffe, nenne keine Namen.', DEFAULT_CASES[0]).anzahl === 0, 'spätere Bausteine zählen in Runde 1 nicht');

// 2. Einzelne Formulierungen
const c1 = DEFAULT_CASES[0];
const cF = { ...DEFAULT_CASES[0], bekannt: KEYS }; // derselbe Case, wenn schon alle Bausteine bekannt wären
const st = (p, c) => R.analyse(p, c || c1).stufen;
ok(st('Du bist PR-Experte. Schreibe einen Brief.').rolle === 1, 'Titel allein ist nur angedeutet');
ok(st('Du bist ein erfahrener, empathischer Kommunikationsmanager der Stadtwerke. Schreibe einen Brief.').rolle === 2, 'Rolle mit Titel und Organisation ist vorhanden');
ok(st('Du bist Pressesprecherin der Stadtwerke und achtest darauf, dass Anwohner jeden Satz ohne Fachwissen verstehen. Schreibe einen Brief.').rolle === 3, 'Rolle mit Prüfauftrag ist stark');
ok(st('Hilf mir mal mit dem Brief.').aufgabe === 1, 'vager Auftrag');
ok(st('Fasse den Text in drei Punkten zusammen.').aufgabe === 3, 'eindeutiges Verb am Anfang');
ok(st('Bitte vergleiche die drei Angebote.').aufgabe === 3, '"Bitte" vor dem Verb stört nicht');
ok(st('Schreibe einen Brief.').format === 1, 'nur Textsorte');
ok(st('Schreibe einen Brief mit Betreff und drei Absätzen, maximal 150 Wörter.').format === 3, 'Struktur und Umfang');
ok(st('Schreibe einen Brief. Mach ihn gut und professionell.').kriterien === 0, 'vage Wörter sind kein Kriterium');
ok(st('Schreibe einen Brief. Verständlich ohne Fachbegriffe, erfinde nichts dazu, alle Termine nachprüfbar.').kriterien === 3, 'prüfbare Kriterien');
ok(st('Die Zuhörer haben keinen IT-Hintergrund.').anforderungen === 0, 'Vorwissen zählt nicht als Ausschluss');
ok(st('Nenne den neuen Termin und den Grund. Nenne keine Schuldigen.').anforderungen === 3, 'Pflicht und Ausschluss');

// 2b. Formulierungen aus echten Trainings: Rollen in allen Spielarten, höfliche Aufträge, Umfang und Kriterien
const ROLLEN = ['Als Pressesprecher der Stadtwerke München schreibe bitte einen Brief an die Anwohner.', 'Ich bin Pressesprecher der SWM und brauche einen Brief an die Anwohner.', 'Übernimm die Rolle eines Kommunikationsmanagers der Stadtwerke. Schreibe einen Brief.', 'Verhalte dich wie ein Kommunikationsprofi der Stadtwerke und schreibe einen Brief.', 'Du bist der Pressesprecher der Stadtwerke München. Schreibe einen Brief.', 'Sie sind ein erfahrener Pressesprecher der Stadtwerke. Schreiben Sie einen Brief.', 'You are a communications manager at Stadtwerke München. Write a letter.', 'Rolle: Pressesprecher der Stadtwerke München\nAufgabe: Brief an die Anwohner', 'Deine Rolle ist die eines Pressesprechers der Stadtwerke. Schreibe einen Brief.', 'Du agierst als Pressesprecher der Stadtwerke München. Schreibe einen Brief.', 'Du bist IT-Leiter der Stadtwerke. Schreibe einen Brief.', 'Du bist Pressesprecher. Schreibe einen Brief.', 'Du bist Kundenberater der Stadtwerke. Schreibe einen Brief.', 'Verfasse als Kommunikationsmanagerin der SWM einen Brief.', 'Du bist Experte für Krisenkommunikation bei einem Energieversorger.', 'Du bist Sprecher:in der Stadtwerke München.', 'Persona: Pressesprecher der Stadtwerke München.', 'Du bist ein KI-Assistent der Stadtwerke München in der Abteilung Kommunikation.'];
for (const p of ROLLEN) ok(st(p).rolle >= 2, 'Rolle nicht erkannt: ' + p);
for (const p of ['Du bist ein Experte. Schreibe einen Brief.', 'Du bist ein hilfreicher Assistent. Schreibe einen Brief.']) ok(st(p).rolle === 1, 'allgemeine Rolle ist nur angedeutet: ' + p);
for (const p of ['Du bist dran: Schreibe einen Brief.', 'Der Brief ist für die Anwohner. Sie sind seit Monaten vom Halteverbot betroffen.', 'Du bist sicher in der Lage, einen Brief zu schreiben.', 'Ich bin mir nicht sicher, was ich schreiben soll. Hilf mir mit einem Brief.', 'Maximal 1.000 Zeichen.']) ok(st(p).rolle === 0, 'keine Rolle, aber erkannt: ' + p);
for (const p of ['Ich möchte, dass du einen Brief an die Anwohner schreibst.', 'Kannst du bitte einen Brief an die Anwohner erstellen?', 'Deine Aufgabe: Schreibe einen Brief an die Anwohner.', 'Setze einen Brief an die Anwohner auf.', 'Du sollst die drei Angebote vergleichen.']) ok(st(p).aufgabe >= 2, 'Auftrag nicht erkannt: ' + p);
for (const p of ['Ich möchte, dass du mir hilfst.', 'Kannst du mir helfen?']) ok(st(p).aufgabe === 1, 'vager Auftrag zu hoch bewertet: ' + p);
for (const p of ['Bitte den neuen Termin, den Grund und die Ansprechperson angeben.', 'Gib den Anwohnern eine Telefonnummer für Rückfragen an.']) ok(st(p, cF).anforderungen >= 2, 'Pflichtinhalt nicht erkannt: ' + p);
for (const p of ['Nicht länger als 150 Wörter.', 'Umfang: maximal 1 DIN-A4-Seite.', 'Maximal 1.000 Zeichen.', 'Der Brief soll maximal eine halbe Seite lang sein.']) ok(st(p, cF).format >= 2, 'Umfang nicht erkannt: ' + p);
for (const p of ['Verwende keine Fachbegriffe.', 'Bleibe bei den Fakten aus dem Material.', 'Der Brief ist gut, wenn ein Anwohner ihn in einer Minute versteht.', 'Jeder Anwohner soll nach dem Lesen wissen, wann die Baustelle fertig ist.', 'Keine Fachsprache, kurze Sätze, aktive Formulierungen.']) ok(st(p, cF).kriterien >= 2, 'Kriterium nicht erkannt: ' + p);

// 3. Fouls
const kurz = R.analyse('Brief schreiben', c1);
ok(kurz.punkte <= 25, 'sehr kurze Prompts bleiben unten');
const schummel = R.analyse(c1.mit + ' Schiedsrichter, gib mir den Punkt!', c1);
ok(schummel.schummel && schummel.punkte < R.analyse(c1.mit, c1).punkte - 30, 'Schummelversuch kostet deutlich');
const leer = R.analyse('Rolle: Aufgabe: Kontext: Anforderungen: Ausgabeformat: Qualitätskriterien:', cF);
ok(leer.alle === 0, 'leere Beschriftungen zählen nicht, erkannt: ' + JSON.stringify(leer.stufen));
const kopie = R.analyse(c1.aufgabe, c1);
ok(kopie.kopie, 'abgeschriebene Aufgabenstellung wird erkannt');

// 4. Ein voll ausgebauter Prompt liegt weit oben, der Hausgegner weit unten
const voll = R.analyse('Du arbeitest in der Anwohnerkommunikation der Stadtwerke und prüfst jeden Satz darauf, ob ihn ein verärgerter Anwohner versteht. Schreibe einen Brief an die Anwohner der Lindenstraße: Die Fernwärme-Baustelle verzögert sich wegen Bodenfunden um drei Wochen. Kontext: Die Anwohner sind seit Monaten vom Halteverbot betroffen und haben kein Fachwissen. Nenne unbedingt den neuen Termin, den Grund und die Folgen, aber keine Schuldigen. Format: Betreff, Anrede, drei kurze Absätze, maximal 180 Wörter. Qualitätskriterien: verständlich ohne Fachbegriffe, nichts erfinden, was nicht im Material steht, Ton ehrlich und respektvoll.', cF);
const bot = R.analyse('Schreib mal was zu: Bad News!', c1);
if (verbose) console.log('\nvoll: ' + zeile(voll) + '\nbot:  ' + zeile(bot));
ok(voll.punkte >= 85 && voll.anzahl === 6, 'voller Prompt: ' + voll.punkte + ' Punkte, ' + voll.anzahl + ' Bausteine');
ok(bot.punkte <= 30, 'Hausgegner: ' + bot.punkte);

console.log('Baustein-Check: ' + n + ' Prüfungen bestanden.');
