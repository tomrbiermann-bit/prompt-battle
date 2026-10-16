// Baustein-Check: regelbasierte Standardbewertung ohne KI.
// Prüft jeden Prompt gegen die sechs Bausteine des Prompt-Baukastens, gegen die Fakten des Cases
// und auf Prompt-Techniken. Gewertet und genannt werden nur die Bausteine, die im Battle schon dran waren.
// Der Baustein, um den es in der Runde geht, zählt dreifach.
//
// Wichtig zu wissen: Der Check erkennt Formulierungen, er versteht keine Inhalte. Er kann also sagen,
// ob ein Prompt eine Rolle, ein Format oder prüfbare Kriterien enthält, aber nicht, ob sie klug gewählt sind.
const { BAUSTEINE, KEYS, byKey, ALLE } = require('./bausteine');

const STUFE = ['fehlt', 'angedeutet', 'vorhanden', 'stark'];
const WERT = [0, 0.4, 0.75, 1];

// ---------------------------------------------------------------- Text zerlegen
function saetze(text) {
  const out = [];
  text = text.replace(/(\d)\.(\d{3})\b/g, '$1$2'); // Tausenderpunkte ("1.000 Zeichen") sind kein Satzende
  const re = /[^.!?\n]+(?:[.!?]+(?=\s|$)|\n|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const roh = m[0].trim();
    if (roh.replace(/[^\p{L}\p{N}]/gu, '').length < 2) continue;
    out.push({ roh, t: roh.toLowerCase() });
  }
  // Abkürzungen wie "z. B." oder "max." reißen Sätze auseinander: sehr kurze Stücke an den Vorgänger hängen
  const merged = [];
  for (const s of out) {
    const prev = merged[merged.length - 1];
    if (prev && (/\b(z|b|u|a|d|h|max|min|ca|bzw|inkl|ggf|evtl|nr|vgl|usw|etc|\d+)\.$/.test(prev.t) || s.t.replace(/[^\p{L}]/gu, '').length < 3)) {
      prev.roh += ' ' + s.roh; prev.t += ' ' + s.t;
    } else merged.push({ ...s });
  }
  return merged;
}

const woerter = (t) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []);

function zitat(s, max = 140) {
  let z = s.replace(/\s+/g, ' ').replace(/^[\s\-*•\d.)\]]+/, '').replace(/^\[[^\]]*\]\s*/, '').trim();
  if (z.length > max) z = z.slice(0, max - 1).replace(/\s+\S*$/, '') + ' …';
  return z;
}

// erster Satz, auf den das Muster passt
function finde(S, re) {
  for (const s of S) if (re.test(s.t)) return s;
  return null;
}

// Beschriftung wie "Rolle:" oder "[Kontext]" zählt nur, wenn danach auch etwas steht
const LABELS = 'rolle|persona|role|aufgabe|auftrag|kontext|hintergrund|anforderung(?:en)?|ausgabeformat|format|qualitätskriteri(?:um|en)|kriterien';
function label(S, name) {
  const re = new RegExp('(?:^|[\\s.])\\[?(?:' + name + ')\\]?\\s*[:\\]]\\s*(.*?)(?=\\[?(?:' + LABELS + ')\\]?\\s*[:\\]]|$)');
  for (const s of S) {
    const m = s.t.match(re);
    if (m && woerter(m[1]).length >= 3) return s;
  }
  return null;
}

// ---------------------------------------------------------------- Die sechs Bausteine
// Rolle: Eine Rollenzuweisung besteht aus einer Formulierung ("Du bist …", "Als …", "Übernimm die Rolle …")
// und einer Rollenbezeichnung (Pressesprecher, Kundenberaterin, Mitarbeiter, Experte …). Feste Formulierungen
// reichen allein, weiche brauchen im selben Satz eine Rollenbezeichnung, sonst wäre "Du bist dran" eine Rolle.
const NOMEN_SRC = '(?<![\\p{L}])(?:(?:\\p{L}+-)?\\p{L}*(?:sprecher|manager|leiter|leitung|berater|experte|expertin|expert|mitarbeiter|mitarbeitende|assistent|assistant|ingenieur|techniker|redakteur|journalist|texter|autor|jurist|anwalt|anwältin|controller|analyst|trainer|lehrer|sachbearbeiter|referent|beauftragte|verantwortliche|ansprechpartner|kommunikator|planer|meister|officer|specialist|consultant|writer|spezialist|fachkraft|fachmann|fachfrau|kollege|kollegin|angestellte|geschäftsführer|bürgermeister|direktor|dezernent|kundenservice|pressestelle|abteilung|marketer|designer|entwickler|programmierer|architekt|helfer|stratege|strategin|moderator|betreuer|verwalter|vermittler|dienstleister|versorger|handwerker|monteur|elektriker|installateur|kaufmann|kauffrau|organisator|generalist|lektor|übersetzer|dolmetscher|pädagoge|psychologe|pfleger)|ki|chatbot|bot|copilot|sprachmodell|modell|person|team|agentur|vorstand|profi|chef|chefin|coach|arzt|ärztin)(?:in|innen|:in|/in|\\*in|e|en|s|n|ern)?(?![\\p{L}])';
const NOMEN = new RegExp(NOMEN_SRC, 'u');
// feste Rollenformulierungen: zählen auch ohne erkannte Rollenbezeichnung
const ROLLE_FEST = /(?<![\p{L}])(agiere als|agierst als|handle als|handele als|handelst als|fungiere als|fungierst als|versetze dich in|versetz dich in|schlüpf(e|st)? in|(nimm|übernimm|nimmst|übernimmst) die (rolle|perspektive|sicht|position)|in der rolle|in die rolle|deine rolle ist|deine rolle:|your role is|aus (der )?sicht (eine[sr]|von|des|der|unserer|einer)|aus der perspektive|du arbeitest (als|in|im|bei|für)|du bist (tätig|beschäftigt|angestellt) (als|bei|in|im)|verhalte dich (wie|als)|verhältst dich (wie|als)|act as|take (on )?the role|you are (a|an)|you're (a|an))(?![\p{L}])/u;
// weiche Formulierungen: brauchen eine Rollenbezeichnung im selben Satz
const ROLLE_WEICH = /(?<![\p{L}])(du bist|sie sind|ihr seid|ich bin|wir sind|stell dir vor,? du|gehe? davon aus,? dass du|angenommen,? du|antworte als|schreib\w* als|verfasse als|formuliere als|arbeite als|argumentiere als|erkläre als|you are|i am)(?![\p{L}])/u;
const ROLLE_ALS = new RegExp('(?<![\\p{L}])als (?:(?:ein|eine|einen|einer|der|die|das|des|dem) )?(?:\\p{L}+(?:er|e|en|es|em),? )?(?:\\p{L}+(?:er|e|en|es|em) )?' + NOMEN_SRC, 'u');
const ROLLE_TIEFE = /(prüf|achte(st)? (dabei |besonders |vor allem )?(auf|darauf)|beurteil|bewerte(st)?\b|verantwort|zuständig|spezialisiert|mit (dem |einem )?(fokus|schwerpunkt|blick) auf|blickwinkel|kennst|weißt|verstehst|betreust|seit \d+ jahren|seit (vielen|über)|deren aufgabe|dessen aufgabe|deine aufgabe ist|dir ist wichtig|legst (du )?wert|und (schreibst|formulierst|erklärst|übersetzt|denkst|arbeitest|berätst|kommunizierst|sprichst|informierst|siehst|fragst)|der (täglich|regelmäßig)|die (täglich|regelmäßig)|jahren? erfahrung|erfahren[e]? (im|in|mit))/;
// allgemeine Bezeichnungen ohne Fach oder Organisation sind nur ein angedeuteter Blickwinkel
const ROLLE_ALLGEMEIN = /\b(experte|expertin|expert|profi|assistent|assistentin|assistant|helfer|helferin|ki|chatbot|bot|texter|texterin|autor|autorin|spezialist|spezialistin|writer|sprachmodell|copilot|modell|person)\b/g;
const SPEZIFIKATION = /\b(für|bei|in|im|der|des|von|vom|mit|einer|eines|seit|aus|auf|dessen|deren)\b/;

const istRolle = (s) => ROLLE_FEST.test(s.t) || ROLLE_ALS.test(s.t) || (ROLLE_WEICH.test(s.t) && NOMEN.test(s.t));

function rolle(S) {
  const s = S.find(istRolle) || label(S, 'rolle|persona|role');
  if (!s) return { stufe: 0 };
  const n = woerter(s.t).length;
  if (ROLLE_TIEFE.test(s.t) && n >= 7) return { stufe: 3, zitat: zitat(s.roh), notiz: 'mit Blickwinkel und Prüfauftrag' };
  // nur allgemein ("Du bist ein Experte"), wenn außer der allgemeinen Bezeichnung weder Fach noch Organisation dasteht
  const m = s.t.match(ROLLE_ALLGEMEIN);
  if (m) {
    const rest = s.t.replace(ROLLE_ALLGEMEIN, ' ');
    const danach = s.t.slice(s.t.search(ROLLE_ALLGEMEIN) + m[0].length);
    if (!NOMEN.test(rest) && !SPEZIFIKATION.test(danach) && !ROLLE_FEST.test(s.t)) return { stufe: 1, zitat: zitat(s.roh), notiz: 'nur ein allgemeiner Titel, ohne Fach oder Blickwinkel' };
  }
  return { stufe: 2, zitat: zitat(s.roh), notiz: 'eine Rolle ist benannt, der Prüfauftrag fehlt noch' };
}

const V_KLAR = ['extrahiere', 'kategorisiere', 'vergleiche', 'bewerte', 'analysiere', 'priorisiere', 'identifiziere', 'ordne', 'fasse', 'strukturiere', 'gliedere', 'unterscheide', 'trenne', 'gruppiere', 'leite', 'überführe', 'begründe', 'prüfe', 'übersetze', 'sortiere', 'markiere', 'klassifiziere', 'ermittle', 'berechne', 'weise', 'werte', 'filtere', 'kürze', 'liste', 'verdichte', 'stelle'];
// Verben, die etwas herstellen: mit einem konkreten Objekt dahinter sind sie eindeutig ("Schreibe einen Brief an die Anwohner")
const V_PROD = ['setze', 'bereite', 'generiere', 'generier', 'erzeuge', 'produziere', 'baue', 'bau', 'schreibe', 'schreib', 'verfasse', 'formuliere', 'erstelle', 'entwirf', 'entwerfe', 'erkläre', 'erläutere', 'beschreibe', 'entwickle', 'erarbeite', 'skizziere', 'informiere', 'präsentiere', 'nenne'];
const V_ALLG = V_PROD.concat(['gib', 'generiere', 'liefere', 'bereite', 'baue', 'mache', 'mach']);
// Aufträge im Infinitiv: "Jede Zahl mit Seitenangabe belegen", "Brief schreiben"
const INFINITIVE = V_KLAR.concat(V_PROD).filter((v) => v.length > 4 && !['entwirf', 'schreib'].includes(v)).map((v) => v.replace(/e$/, '') + 'en').concat(['entwerfen', 'belegen', 'auflisten']);
const OBJEKT = ['einen', 'eine', 'ein', 'den', 'die', 'das', 'dem', 'der', 'zwei', 'drei', 'vier', 'fünf', 'alle', 'jede', 'jeden', 'jedes', 'kurz', 'daraus', 'dazu'];
const V_SCHWACH = /\b(hilf mir|hilf uns|mach es|mache es|mach das|mach mal|mach daraus|mach draus|mach eine|mache eine|schreib mal|mal was|irgendwas|irgendwie|kümmere dich|schau (dir|mal)|kannst du|könntest du|ich brauche|ich bräuchte|ich möchte|ich will|wäre (gut|schön|toll))\b/;
const UMSCHREIBUNG = /^(ich (möchte|will|brauche|bräuchte|hätte gern\w*|wünsche mir)[, ]*(dass du |von dir[, ]*(dass du )?)?|(kannst|könntest|würdest|kannst du mir|könntest du mir|würdest du mir) ?(du )?(bitte |mir |mal )*|du sollst |du musst |du wirst |bitte (hilf mir und |mir )?)/;
const VORSPANN = /^((deine |die |meine )?\[?(aufgabe|auftrag|task|ziel|deine aufgabe ist es|deine aufgabe ist)\]?\s*[:\]]?\s*|\d+[.)]\s*|[-*•]\s*|bitte\s+|und\s+|dann\s+|danach\s+|anschließend\s+|zuerst\s+|nun\s+|jetzt\s+)+/;

function aufgabe(S) {
  let best = { stufe: 0 };
  const nimm = (stufe, s, notiz) => { if (stufe > best.stufe) best = { stufe, zitat: zitat(s.roh), notiz }; };
  for (const s of S) {
    let kern = s.t.replace(VORSPANN, '');
    // höfliche Umschreibung: "Ich möchte, dass du einen Brief schreibst", "Kannst du bitte einen Brief erstellen", "Du sollst einen Brief schreiben"
    const hm = kern.match(UMSCHREIBUNG);
    let umschrieben = false;
    if (hm) {
      const rest = kern.slice(hm[0].length);
      const rw = woerter(rest);
      const verb = rw.find((x) => INFINITIVE.includes(x) || V_KLAR.includes(x.replace(/st$/, 'e')) || V_PROD.includes(x.replace(/st$/, 'e')) || V_ALLG.includes(x.replace(/st$/, 'e')));
      if (verb) { umschrieben = true; kern = (verb.endsWith('en') ? verb.slice(0, -2) + 'e' : verb.replace(/st$/, 'e')) + ' ' + rw.filter((x) => x !== verb).join(' '); }
    }
    const w = woerter(kern);
    let erstes = w[0] || '';
    if (!V_KLAR.includes(erstes) && !V_ALLG.includes(erstes) && (V_KLAR.includes(erstes + 'e') || V_ALLG.includes(erstes + 'e'))) erstes += 'e'; // "Fass", "Vergleich", "Erstell"
    const letztes = w[w.length - 1] || '';
    const schwach = !umschrieben && V_SCHWACH.test(s.t);
    const objekt = w.length >= 5 && w.slice(1, 6).some((x) => OBJEKT.includes(x)); // "Schreibe einen Brief ...", "Erstelle mir eine Tabelle ..."
    if ((V_KLAR.includes(erstes) || (V_PROD.includes(erstes) && objekt)) && !schwach) nimm(3, s, 'eindeutiges Verb am Satzanfang');
    else if (V_ALLG.includes(erstes) && !schwach) nimm(2, s, 'ein Auftrag ist da, aber noch unscharf: Was genau soll entstehen?');
    else if (new RegExp('[,;:] (' + V_KLAR.join('|') + ')\\b').test(s.t) || new RegExp('\\bund (' + V_KLAR.join('|') + ')\\b').test(s.t)) nimm(2, s, 'das Verb steht mitten im Satz');
    else if (!schwach && w.length >= 2 && INFINITIVE.some((inf) => letztes.endsWith(inf))) nimm(2, s, 'der Auftrag steht im Infinitiv am Satzende, klarer ist das Verb am Anfang');
    else if (schwach || V_ALLG.includes(erstes)) nimm(1, s, 'der Auftrag bleibt vage');
  }
  return best;
}

const K_ANLASS = /(\banlass|ausgangslage|\bweil\b|\bda (wir|sich|die|der|das|es)\b|\bdenn\b|damit (die|der|wir|sie|ich|das)|dient (als|der|dem|zur|zum)|wird (benötigt|gebraucht)|brauche (ich|wir) (das|es|die|den)|\bmorgen\b|morgige|nächste woche|sitzung|\btagt\b|pitch|präsentation|vortrag|onboarding|jour fixe|wöchentlich|entscheidungsgrundlage|entscheiden|zur vorbereitung|grundlage für)/;
const K_ADRESSAT = /(zielgruppe|adressat|leser|empfänger|zuhörer|publikum|\ban (die|den|das|unsere|meine|alle)\b|\bfür (die|den|das|unsere|unseren|meine|meinen)\b|anwohner|stadtrat|stadträt|aufsichtsrat|gremium|mitglieder|bereichsleit|führungskraft|geschäftsführung|\bteam\b|kolleg|kunden|ausschuss|committee|entscheider|vorstand|abteilung|channel|management)/;
const K_VORWISSEN = /(vorwissen|vorkenntnis|kein(e|en)? [\w-]*(techniker|fachleute|experten|spezialisten|profis|juristen)|lesen (vorab|vorher|zuerst|nur)|kenn(t|en) .{0,40}(noch )?nicht|kein(e|en)? [\w-]*(hintergrund|kenntnis|kenntnisse|erfahrung|ahnung|fachwissen)|ohne [\w-]*(hintergrund|kenntnis|kenntnisse|vorwissen|fachwissen)|\blaien\b|fachleute|fachpublikum|einsteiger|nicht (vom fach|vertraut)|kennen (das|die|den|sich)|wissen (nicht|wenig|bereits|schon)|wenig zeit|(kaum|keine) zeit|verärgert|besorgt|skeptisch|genervt|betroffen|achten (stark |besonders |vor allem )?auf|fokussier|interessier|wichtig ist (ihnen|ihr|ihm|den|der)|leg(t|en) wert|erwarte[nt]\b|kennt (das|die|den) (projekt|thema|vorhaben))/;

function kontext(S) {
  const lab = label(S, 'kontext|hintergrund');
  const a = finde(S, K_ANLASS) || lab, b = finde(S, K_ADRESSAT), c = finde(S, K_VORWISSEN);
  const n = (a ? 1 : 0) + (b ? 1 : 0) + (c ? 1 : 0);
  if (!n) return { stufe: 0 };
  // als Fundstelle lieber einen Satz zeigen, der nicht schon die Rolle beschreibt
  const kand = [lab, c, a, b].filter(Boolean);
  const s = kand.find((x) => !istRolle(x)) || kand[0];
  const teile = [a && 'Anlass', b && 'Adressat', c && 'Vorwissen oder Erwartung'].filter(Boolean);
  const fehlt = [!a && 'Anlass', !b && 'Adressat', !c && 'Vorwissen des Adressaten'].filter(Boolean);
  return { stufe: n, zitat: zitat(s.roh), notiz: n === 3 ? 'Anlass, Adressat und Vorwissen sind genannt' : teile.join(' und ') + ' genannt, es fehlt: ' + fehlt.join(', ') };
}

// Formulierungen, die zu Kontext oder Kriterien gehören, sollen nicht als Ausschluss zählen
const NICHT_ANF = /(kein(e|en)? [\w-]*(hintergrund|kenntnis|kenntnisse|vorwissen|erfahrung|ahnung|fachwissen)|ohne [\w-]*(fachbegriffe|fachjargon|fachsprache|fremdwörter|füllwörter|floskeln|vorwissen|hintergrund|fachwissen|spekulation\w*)|keine offenen fragen|nicht (vom fach|vertraut)|wissen nicht|(kaum|keine) zeit|nicht nur)/g;
const A_PFLICHT = /(\bmuss\b|\bmüssen\b|zwingend|unbedingt|auf jeden fall|pflicht|enthalten (sein|muss)|soll(te|en|ten)? .{0,50}(enthalten|vorkommen|nennen|erwähn|stehen)|erwähne|nenne (dabei|unbedingt|auch|außerdem|jeweils|den|die|das)|gehe? (dabei |auch |außerdem )?auf .{2,60} ein|berücksichtige|beziehe .{2,50} ein|folgende (punkte|inhalte|angaben)|weise .{2,70} zu\b|hebe .{2,70} hervor|mit (verantwortliche|termin|frist|datum|betrag|begründung|quelle)|\bje(weils)? (ein|eine|einen|mit)\b|bezug auf|unterscheide|\b(angeben|aufnehmen|einbauen|aufführen|einfügen|anführen|auflisten|mitliefern|ergänzen)\b|gib .{2,70} an\b|nimm .{2,60} (auf|mit auf)\b|baue? .{2,60} ein\b|füge? .{2,60} (ein|hinzu|bei)\b|führe? .{2,60} (auf|an)\b|weise? .{2,60} hin\b|\binhalte?\s*:|inhaltlich|entschuldig|dank(e|t) .{0,30}(für|den)|lade .{2,40} ein)/;
const A_AUSSCHLUSS = /(\bkein(e|en|er|erlei)?\b|\bnicht\b|\bohne\b|vermeide|verzichte|niemals|\bnie\b|unter keinen umständen|auf keinen fall|lass(e)? .{2,40} weg|weglassen|anonymisier|tabu\b|aussparen|spare .{2,40} aus)/;
const A_SCHWACH = /(beachte|achte darauf|wichtig ist|wichtig:)/;

function anforderungen(S) {
  const T = S.map((s) => ({ roh: s.roh, t: s.t.replace(NICHT_ANF, ' ') }));
  const p = finde(T, A_PFLICHT) || label(T, 'anforderung(?:en)?'), a = finde(T, A_AUSSCHLUSS);
  if (p && a) return { stufe: 3, zitat: zitat(a.roh), notiz: 'Pflichtinhalte und Ausschlüsse sind genannt' };
  if (p) return { stufe: 2, zitat: zitat(p.roh), notiz: 'Pflichtinhalte sind genannt, es fehlt, was nicht vorkommen soll' };
  if (a) return { stufe: 2, zitat: zitat(a.roh), notiz: 'ein Ausschluss ist genannt, die Pflichtinhalte fehlen' };
  const w = finde(T, A_SCHWACH);
  if (w) return { stufe: 1, zitat: zitat(w.roh), notiz: 'ein Hinweis, aber keine klare Pflicht' };
  return { stufe: 0 };
}

const F_STRUKTUR = /(tabelle|spalte|zeile\b|stichpunkt|bullet|aufzählung|\bliste\b|gliederung|gliedere|überschrift|zwischenüberschrift|absatz|absätze|abschnitt|nummerier|one-?pager|\bslide|folie|markdown|\bstruktur|aufbau:|betreff|anrede|grußformel|\bjson\b|\bcsv\b|executive summary|zuerst .{2,80}(dann|danach|anschließend)|\b1\.\s.{2,120}\b2\.\s)/;
const F_UMFANG = /((maximal|höchstens|max\.?|mindestens|mind\.?|genau|etwa|ca\.?|rund|in|à|je|bis zu|bis maximal|nicht (länger|mehr|länger als|mehr als)|weniger als|unter|höchstens|umfang:?)\s+(\d[\d.,]*|eine?|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|zwölf|zwanzig)\s*(din[- ]?a4[- ]?)?(wörter|wörtern|worte|worten|sätze|sätzen|satz|zeilen|zeichen|absätze|absätzen|stichpunkte|stichpunkten|bulletpoints?|bullets|punkte|punkten|minuten|seiten?|spalten)|\b(\d+|zwei|drei)[- ]?(minütig|minuten|seitig)|eine (halbe )?(din[- ]?a4[- ]?)?seite|einseitig|din[- ]?a4[- ]?seite|halbe seite|kurz und knapp)/;
const F_SORTE = /(brief|e-?mail|\bmail\b|update|bericht|zusammenfassung|pitch|\brede\b|nachricht|\bpost\b|protokoll|vorlage|\bkurz|knapp)/;

function format(S) {
  const s = finde(S, F_STRUKTUR) || label(S, 'ausgabeformat|format'), u = finde(S, F_UMFANG);
  if (s && u) return { stufe: 3, zitat: zitat(s.roh), notiz: 'Struktur und Umfang sind festgelegt' };
  if (s) return { stufe: 2, zitat: zitat(s.roh), notiz: 'die Struktur ist festgelegt, der Umfang noch nicht' };
  if (u) return { stufe: 2, zitat: zitat(u.roh), notiz: 'der Umfang ist festgelegt, die Struktur noch nicht' };
  const t = finde(S, F_SORTE);
  if (t) return { stufe: 1, zitat: zitat(t.roh), notiz: 'nur die Textsorte, keine Struktur' };
  return { stufe: 0 };
}

const Q_PRUEFBAR = [
  /verständlich (für|ohne|auch für)|ohne (fachbegriffe|fachjargon|fachsprache|fremdwörter|fachwörter|abkürzungen|nachfragen?|rückfragen?)|keine (fachbegriffe|fachsprache|fachjargon|fremdwörter|fachwörter|abkürzungen|schachtelsätze)|frei von (fachjargon|fachbegriffen|fachsprache|fremdwörtern|floskeln|füllwörtern)|für laien verständlich|laienverständlich|leicht verständlich|allgemeinverständlich|in einfacher sprache|einfache sprache|alltagssprache|kurze sätze|aktiv(e|en)? formulier|aktiv formuliert|\bverständlich\b/,
  /ohne (füllwörter|floskeln|spekulation\w*)|keine (floskeln|füllwörter|spekulation\w*)/,
  /sofort (anwendbar|nutzbar|verwendbar|umsetzbar)|direkt (verwendbar|nutzbar|versendbar|einsetzbar)|versandfertig|ohne nacharbeit/,
  /keine offenen fragen|\bvollständig\b|lückenlos|nach dem lesen|beim lesen|soll .{0,60}(wissen|erkennen|nachvollziehen|verstehen können)|weiß .{0,40}(danach|anschließend|sofort)/,
  /seitenangabe|seitenzahl|mit (quelle|beleg|fundstelle)|\bbeleg|quellenangabe|nachprüfbar|überprüfbar|nachvollziehbar|belastbar/,
  /fakten und annahmen|annahmen (kennzeichne|markiere|trenne|als solche)|kennzeichne .{0,40}(annahme|unsicher|vermutung)|unsicher(es|heiten)? (kennzeichne|markiere)/,
  /nichts erfinde|erfinde nichts|nichts hinzu|keine (erfundenen|zusätzlichen|eigenen) (angaben|fakten|zahlen|inhalte|informationen|details)|nur (aus|was|informationen|angaben|zahlen|fakten|inhalte) .{0,40}(material|text|notizen|transkript|vorlage|auszug|steht|stehen|genannt)|ausschließlich .{0,40}(material|text|notizen|transkript|vorlage|auszug)|nicht (explizit |ausdrücklich )?im (text|auszug|material|transkript)|nicht in (den|der|dem) (notizen|vorlage|unterlagen|quellen)|keine (vorhersagen|prognosen)|bleib\w* bei den fakten|bei den fakten bleib|nur (die )?fakten|übereinstimm|stimm(t|en) mit .{0,30}(material|vorlage|text|quelle|angaben) überein|ohne (beschönigung|übertreibung|werbesprache|marketingsprache)|nicht beschönig|keine (beschönigung|übertreibung)|\btatsachen\b/,
  /widerspr(uch|üche)|unbelegt|als (annahme|schätzung|vermutung) (kennzeichne|markier)/,
  /wenn .{2,60}(fehlt|fehlen|unklar|nicht (im|in den|in der|aus)).{0,60}(sag|kennzeichne|markiere|frag|schreib|weise)/,
  /so,? dass|sodass|damit (die|der|sie|er|man|jeder|alle) .{0,60}(versteh|entscheid|weiß|wissen|handeln|nachvollzieh)|in (\d+|zwei|drei) (minuten|sekunden) (lesbar|sprechbar|vortragbar|erfassbar)|auf einen blick/,
  /gut ist (das ergebnis|die antwort|der text),? wenn|ist (gut|gelungen|fertig|erfolgreich|richtig),? wenn|gilt als (gut|gelungen),? wenn|in (einer|einem|\d+|zwei|drei|fünf) (minute|minuten|sekunden) (lesbar|verstanden|versteh|erfass|erfasst|lesen)|woran (man|ich|wir)|maßstab|priorisiere|wichtiger als|\bvor (vollständigkeit|detailtiefe|länge)\b/,
  /prägnant|datenbasiert|\bkonkret\b|eindeutig formuliert|widerspruchsfrei|korrekt(e|en)? (zahlen|angaben)|rechne nach|zahlen (stimmen|prüfen)/
];
const Q_TON = /(neutral|sachlich|objektiv|wertschätzend|respektvoll|empathisch|freundlich|höflich|transparent|ehrlich|behördlich|tonalität|tonfall|\bton\b|du-form|sie-form|duze|sieze)/;
const VAGE = /\b(gut|gute[rnms]?|besser|professionell\w*|schön\w*|ansprechend\w*|toll\w*|super|ordentlich\w*|hochwertig\w*|perfekt\w*|bestmöglich\w*|optimal\w*|vernünftig\w*|anständig\w*)\b/g;

function kriterien(S, alles) {
  let n = 0, erstes = null;
  for (const re of Q_PRUEFBAR) { const s = finde(S, re); if (s) { n++; erstes = erstes || s; } }
  if (!n) { const s = label(S, 'qualitätskriteri(?:um|en)|kriterien'); if (s) { n = 1; erstes = s; } }
  const ton = finde(S, Q_TON);
  const vage = [...new Set((alles.replace(/gut(e[rnms]?)? (ist|sind)|gute idee|so gut wie/g, ' ').match(VAGE) || []))];
  const punkte = n * 1.5 + (ton ? 1 : 0);
  let r;
  if (punkte >= 3.5) r = { stufe: 3, zitat: zitat((erstes || ton).roh), notiz: 'mehrere prüfbare Kriterien' };
  else if (punkte >= 1.5) r = { stufe: 2, zitat: zitat((erstes || ton).roh), notiz: 'ein prüfbares Kriterium, mehr Maßstab wäre möglich' };
  else if (punkte > 0) r = { stufe: 1, zitat: zitat(ton.roh), notiz: 'nur der Ton ist beschrieben' };
  else if (vage.length) r = { stufe: 0, notiz: '"' + vage[0] + '" lässt sich nicht prüfen' };
  else r = { stufe: 0 };
  r.vage = vage;
  return r;
}

// ---------------------------------------------------------------- Techniken, Fakten, Fouls
const TECHNIKEN = [
  ['Few-Shot', /(\bbeispiel\s*:|hier (ist|sind) (ein|zwei|drei|\d) beispiel|nach (diesem|folgendem) (muster|beispiel)|orientiere dich an (diesem|folgendem|den)|so soll es aussehen|im stil von folgendem|muster\s*:)/],
  ['Rückfragen', /(stell(e)? (mir )?(zuerst |vorher |erst |bitte )?(rück)?fragen|frag(e)? (mich|nach|zurück)|rückfrage|falls (dir )?(etwas|informationen|angaben|infos) (unklar|fehl)|wenn (dir )?(etwas|informationen|angaben|infos) (unklar|fehl)|bevor du (anfängst|beginnst|startest|loslegst|schreibst))/],
  ['Chain of Thought', /(schritt für schritt|schrittweise|in (\d+|zwei|drei|vier) schritten|gehe? .{0,30}(systematisch|der reihe nach) vor|zuerst .{2,100}(dann|danach|anschließend)|erst .{2,80}, dann|zwischenergebnis)/],
  ['Kritik und Verbesserung', /(prüfe (dein|das|deinen) (ergebnis|entwurf|text|antwort)|überprüfe (dein|deine|deinen|das)|kritisiere|verbessere (ihn |sie |es )?(dann|anschließend|danach)|(zweite|verbesserte|überarbeitete) (fassung|version)|kontrolliere (dein|am ende)|prüfe am ende|lies .{0,30}gegen)/],
  ['Schutzanweisung', /(erfinde nichts|nichts erfinde|nichts hinzu|keine (annahmen|erfundenen|vorhersagen|prognosen|spekulation\w*)|wenn .{2,60}(fehlt|fehlen|unklar|nicht (im|in den|in der|aus)).{0,60}(sag|kennzeichne|markiere|frag|schreib|weise)|kennzeichne .{0,40}(annahme|unsicher|vermutung)|nur .{0,50}aus (dem|den|der) (material|text|notizen|transkript|vorlage|auszug)|ausschließlich)/]
];
const SCHUMMEL = /\b(schiedsrichter|jury|gib mir (den|einen) punkt|lass mich gewinnen|ich (soll|muss) gewinnen|bewerte (mich|diesen prompt) (als|mit)|ignoriere (alle|die|deine) (regeln|anweisungen|vorgaben)|ignore (all|previous)|volle punktzahl|100 punkte|baustein-check)\b/;

function fakten(t, liste) {
  const total = (liste || []).length;
  if (!total) return { treffer: 0, total: 0 };
  let treffer = 0;
  for (const gruppe of liste) {
    let re;
    try { re = new RegExp('(' + String(gruppe).toLowerCase() + ')'); } catch (_) { re = null; }
    if (re ? re.test(t) : t.includes(String(gruppe).toLowerCase())) treffer++;
  }
  return { treffer, total };
}

// Anteil des Prompts, der wörtlich aus der Aufgabenstellung stammt
function kopie(t, aufgabeText) {
  const a = woerter(String(aufgabeText || '').toLowerCase()), p = woerter(t);
  if (p.length < 12 || a.length < 12) return 0; // sehr kurze Texte sagen nichts aus
  const gramme = new Set();
  for (let i = 0; i + 4 <= a.length; i++) gramme.add(a.slice(i, i + 4).join(' '));
  let hit = 0, n = 0;
  for (let i = 0; i + 4 <= p.length; i++) { n++; if (gramme.has(p.slice(i, i + 4).join(' '))) hit++; }
  return n ? hit / n : 0;
}

// Welche Bausteine sind in dieser Runde schon bekannt? Das Battle baut den Baukasten Schritt für Schritt auf:
// In Runde 1 zählt und erscheint nur der erste Baustein, in Runde 2 der erste und der zweite, und so weiter.
// c.bekannt setzt das Spiel beim Start der Runde. Fehlt die Angabe (freie Cases ohne Baustein), zählen alle sechs.
function bekannt(c) {
  if (!c || c.fokus === ALLE) return KEYS.slice();
  const K = Array.isArray(c.bekannt) ? KEYS.filter((k) => c.bekannt.includes(k)) : [];
  if (byKey[c.fokus] && !K.includes(c.fokus)) K.push(c.fokus);
  return K.length ? KEYS.filter((k) => K.includes(k)) : KEYS.slice();
}

// Bausteine aller bisher gespielten Cases, in der Reihenfolge des Baukastens
function bekanntBis(cases) {
  const K = new Set();
  for (const c of cases) { if (c.fokus === ALLE) KEYS.forEach((k) => K.add(k)); else if (byKey[c.fokus]) K.add(c.fokus); }
  return KEYS.filter((k) => K.has(k));
}

const gewichte = (fokus, K) => Object.fromEntries(K.map((k) => [k, fokus === ALLE ? 1.5 : k === fokus ? 3 : 1]));

// ---------------------------------------------------------------- Analyse eines Prompts
function analyse(prompt, c) {
  const text = String(prompt || '');
  const t = text.toLowerCase().replace(/[„“”«»]/g, '"').replace(/[ \t]+/g, ' ');
  const S = saetze(text.replace(/[„“”«»]/g, '"'));
  const W = woerter(t);
  const fokus = c && c.fokus ? c.fokus : '';
  const K = bekannt(c);
  const det = { rolle: rolle(S), aufgabe: aufgabe(S), kontext: kontext(S), anforderungen: anforderungen(S), format: format(S), kriterien: kriterien(S, t) };
  const stufen = {}, zitate = {}, notizen = {};
  for (const k of KEYS) { stufen[k] = det[k].stufe; if (det[k].zitat) zitate[k] = det[k].zitat; if (det[k].notiz) notizen[k] = det[k].notiz; }
  const technik = TECHNIKEN.filter(([, re]) => re.test(t)).map(([name]) => name);
  const fk = fakten(t, c && c.stichworte);
  const schummel = SCHUMMEL.test(t);
  const kop = kopie(t, c && c.aufgabe);
  const vage = K.includes('kriterien') ? det.kriterien.vage || [] : []; // vage Wörter zählen erst, wenn die Qualitätskriterien dran waren

  // Punkte gibt es nur für die bekannten Bausteine, der Baustein der Runde zählt dreifach
  const G = gewichte(fokus, K);
  let sum = 0, max = 0;
  for (const k of K) { sum += G[k] * WERT[stufen[k]]; max += G[k]; }
  let punkte = 10 + 62 * (sum / max);
  punkte += fk.total ? 12 * (fk.treffer / fk.total) : 6;
  punkte += Math.min(6, technik.length * 2);
  punkte += 10 * Math.min(1, W.length / 60);
  if (stufen.kriterien < 2) punkte -= Math.min(6, vage.length * 3);
  if (kop > 0.75) punkte -= 15;
  if (W.length < 6) punkte = Math.min(punkte, 25);
  if (schummel) punkte -= 40;
  punkte = Math.max(0, Math.min(100, Math.round(punkte)));

  return {
    stufen, zitate, notizen, technik, fakten: fk, vage, woerter: W.length, kopie: kop > 0.75, schummel, punkte,
    bekannt: K, anzahl: K.filter((k) => stufen[k] >= 2).length, alle: KEYS.filter((k) => stufen[k] >= 2).length
  };
}

// ---------------------------------------------------------------- Texte (nennen nur bekannte Bausteine)
const q = (z) => (z ? ' ("' + z + '")' : '');
const qk = (z) => q(z && z.length > 80 ? z.slice(0, 78).replace(/\s+\S*$/, '') + ' …' : z);
const B = (k) => byKey[k];

function staerke(a, fokus) {
  const K = a.bekannt, G = gewichte(fokus, K);
  const k = K.slice().sort((x, y) => a.stufen[y] - a.stufen[x] || G[y] - G[x])[0];
  let s;
  if (a.stufen[k] >= 2) s = 'Stark beim Baustein ' + B(k).name + ': ' + a.notizen[k] + q(a.zitate[k]) + '.';
  else if (a.stufen[k] === 1) s = 'Ein Ansatz beim Baustein ' + B(k).name + ' ist da' + q(a.zitate[k]) + '.';
  else if (a.fakten.total && a.fakten.treffer / a.fakten.total >= 0.6) s = 'Du gibst der KI die wichtigen Fakten aus dem Case mit.';
  else s = 'Kurz und direkt. Mehr gibt der Prompt der KI aber nicht mit.';
  if (a.technik.length) s += ' Dazu kommt die Technik ' + a.technik.slice(0, 2).join(' und ') + '.';
  return s;
}

function tipp(a, fokus) {
  if (a.schummel) return 'Der Schiedsrichter lässt sich nicht ansprechen. Stecke die Energie lieber in deinen Prompt.';
  if (a.woerter < 6) return 'Dein Prompt ist sehr kurz, die KI muss fast alles erraten. Sag ihr, was entstehen soll, für wen und warum.';
  const K = a.bekannt, G = gewichte(fokus, K);
  const k = K.slice().sort((x, y) => a.stufen[x] - a.stufen[y] || G[y] - G[x])[0];
  const b = B(k);
  let s;
  if (a.stufen[k] === 0) s = 'Dir fehlt der Baustein ' + b.name + ': ' + b.frage + ' So formulierst du ihn: ' + b.so;
  else if (a.stufen[k] === 1) s = 'Der Baustein ' + b.name + ' ist nur angedeutet (' + a.notizen[k] + '). So wird er stark: ' + b.so;
  else if (a.stufen[k] === 2) s = 'Schärfe den Baustein ' + b.name + ' (' + a.notizen[k] + '). ' + b.so;
  else if (K.length === KEYS.length) s = 'Alle sechs Bausteine sitzen. Nächster Schritt: eine Technik ergänzen, zum Beispiel Rückfragen zulassen oder ein Beispiel mitgeben.';
  else if (a.fakten.total && a.fakten.treffer < a.fakten.total) s = (K.length === 1 ? 'Der Baustein ' + b.name + ' sitzt.' : 'Die bisher behandelten Bausteine sitzen.') + ' Gib der KI noch mehr Fakten aus dem Case mit, dann muss sie weniger erraten.';
  else s = (K.length === 1 ? 'Der Baustein ' + b.name + ' sitzt.' : 'Die bisher behandelten Bausteine sitzen.') + ' Weiter so, in den nächsten Runden kommt mehr dazu.';
  if (a.vage.length && a.stufen.kriterien < 2 && k !== 'kriterien') s += ' Übrigens: "' + a.vage[0] + '" kann die KI nicht prüfen. Schreibe, woran man es erkennt.';
  if (a.kopie) s += ' Du hast vor allem die Aufgabenstellung übernommen. Die KI braucht deinen Auftrag, nicht den Case.';
  return s;
}

// Urteil über ein Duell. a und b sind Analysen, die Namen sind "A" und "B".
function duell(a, b, c) {
  const fokus = c && c.fokus ? c.fokus : '';
  const K = a.bekannt, G = gewichte(fokus, K);
  let grund = '';
  let sieger;
  if (a.punkte !== b.punkte) sieger = a.punkte > b.punkte ? 'A' : 'B';
  else {
    // Gleichstand: erst der Baustein der Runde, dann Zahl der bekannten Bausteine, dann Fakten, dann der Rest des Prompts
    const fk = fokus && fokus !== ALLE ? a.stufen[fokus] - b.stufen[fokus] : 0;
    const d = fk || a.anzahl - b.anzahl || a.fakten.treffer - b.fakten.treffer || b.vage.length - a.vage.length || a.alle - b.alle || a.woerter - b.woerter;
    sieger = d > 0 ? 'A' : d < 0 ? 'B' : (Math.random() < 0.5 ? 'A' : 'B');
    grund = d === 0 ? ' Beide Prompts sind im Baustein-Check gleichauf, hier hat das Los entschieden.' : ' Im Baustein-Check liegen beide gleichauf, den Ausschlag gaben Feinheiten im Rest des Prompts.';
  }
  const w = sieger === 'A' ? a : b, l = sieger === 'A' ? b : a, L = sieger === 'A' ? 'B' : 'A';
  const diff = K.map((k) => ({ k, d: G[k] * (WERT[w.stufen[k]] - WERT[l.stufen[k]]) })).sort((x, y) => y.d - x.d)[0];
  // Gewinnt ein Prompt über Fakten oder Technik, obwohl der andere bei den Bausteinen vorn liegt, soll das Urteil das auch sagen
  const vorn = K.some((k) => G[k] * (WERT[l.stufen[k]] - WERT[w.stufen[k]]) > 0);
  const gleichauf = K.length === 1 ? '' : vorn ? ' Bei den Bausteinen liegt Prompt ' + L + ' sogar leicht vorn.' : ' Bei den bisher behandelten Bausteinen liegen beide gleichauf.';
  let text;
  if (K.length === 1) {
    const k = K[0];
    text = 'Baustein-Check zum Baustein ' + B(k).name + ': ';
    if (diff.d > 0) text += 'Bei Prompt ' + sieger + ' ist er ' + STUFE[w.stufen[k]] + qk(w.zitate[k]) + ', bei Prompt ' + L + ' ' + (l.stufen[k] ? 'nur ' + STUFE[l.stufen[k]] : 'fehlt er') + '.';
    else text += (w.stufen[k] === l.stufen[k] ? (w.stufen[k] ? 'Bei beiden Prompts ist er ' + STUFE[w.stufen[k]] + '.' : 'Er fehlt in beiden Prompts.') : 'Hier liegt Prompt ' + L + ' vorn, Prompt ' + sieger + ' macht das an anderer Stelle wett.');
  } else {
    text = 'Baustein-Check: Von den ' + K.length + ' bisher behandelten Bausteinen bringt Prompt A ' + a.anzahl + ' mit, Prompt B ' + b.anzahl + '.';
    if (diff.d > 0) text += ' Den Unterschied macht vor allem der Baustein ' + B(diff.k).name + ': Bei Prompt ' + sieger + ' ist er ' + STUFE[w.stufen[diff.k]] + qk(w.zitate[diff.k]) + ', bei Prompt ' + L + ' ' + (l.stufen[diff.k] ? 'nur ' + STUFE[l.stufen[diff.k]] : 'fehlt er') + '.';
  }
  if (diff.d <= 0) {
    if (w.fakten.treffer > l.fakten.treffer) text += gleichauf + ' Prompt ' + sieger + ' gibt der KI aber mehr Fakten aus dem Case mit.';
    else if (w.technik.length > l.technik.length) text += gleichauf + ' Prompt ' + sieger + ' nutzt zusätzlich die Technik ' + w.technik[0] + '.';
    else if (!grund && w.woerter > l.woerter) text += gleichauf + ' Prompt ' + sieger + ' gibt der KI insgesamt mehr an die Hand.';
  }
  if (l.schummel) text += ' Prompt ' + L + ' hat versucht, den Schiedsrichter zu beeinflussen. Das kostet Punkte.';
  if (l.woerter < 6 && !l.schummel) text += ' Prompt ' + L + ' ist so kurz, dass die KI fast alles erraten müsste.';
  text += grund;
  let sa = a.punkte, sb = b.punkte;
  if (sieger === 'A' && sa <= sb) sa = Math.min(100, sb + 1);
  if (sieger === 'B' && sb <= sa) sb = Math.min(100, sa + 1);
  return {
    winner: sieger, scoreA: sa, scoreB: sb, reason: text,
    strengthA: staerke(a, fokus), strengthB: staerke(b, fokus), tipA: tipp(a, fokus), tipB: tipp(b, fokus),
    cheatA: a.schummel, cheatB: b.schummel
  };
}

// Begründung für den besten Prompt der Runde
function bester(a, c) {
  const fokus = c && c.fokus ? c.fokus : '';
  const K = a.bekannt;
  const stark = K.filter((k) => a.stufen[k] === 3).map((k) => B(k).name);
  let reason;
  if (K.length === 1) reason = 'Höchste Wertung im Baustein-Check: Der Baustein ' + B(K[0]).name + ' ist ' + STUFE[a.stufen[K[0]]] + ', dazu kommen die Fakten aus dem Case.';
  else reason = 'Höchste Wertung im Baustein-Check: ' + a.anzahl + ' von ' + K.length + (K.length === KEYS.length ? '' : ' bisher behandelten') + ' Bausteinen' + (stark.length ? ', besonders stark bei ' + stark.slice(0, 3).join(', ') : '') + '.';
  if (a.technik.length) reason += ' Genutzte Technik: ' + a.technik.join(', ') + '.';
  let learn = '';
  const k = fokus && fokus !== ALLE && a.stufen[fokus] >= 2 ? fokus : K.slice().sort((x, y) => a.stufen[y] - a.stufen[x])[0];
  if (a.stufen[k] >= 2) learn = 'So sieht der Baustein ' + B(k).name + ' in der Praxis aus: "' + a.zitate[k] + '"';
  return { reason, learn };
}

// kompakte Fassung für Speicherung und Anzeige
const kurz = (a) => ({ stufen: a.stufen, zitate: a.zitate, technik: a.technik, vage: a.vage, punkte: a.punkte, anzahl: a.anzahl, alle: a.alle, bekannt: a.bekannt });

// Was Teilnehmer und Beamer sehen dürfen: nur die bekannten Bausteine
function sicht(check, mitZitaten) {
  if (!check) return null;
  const K = check.bekannt || KEYS;
  const nur = (o) => Object.fromEntries(K.filter((k) => o && o[k] !== undefined).map((k) => [k, o[k]]));
  const v = { stufen: nur(check.stufen), anzahl: K.filter((k) => check.stufen[k] >= 2).length, gesamt: K.length };
  if (mitZitaten) { v.zitate = nur(check.zitate); v.technik = check.technik || []; }
  return v;
}

module.exports = { analyse, duell, bester, kurz, sicht, bekanntBis, staerke, tipp, STUFE };
