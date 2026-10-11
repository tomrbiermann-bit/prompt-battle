// Der Prompt-Baukasten aus dem Training: sechs Bausteine, Texte wie in der Präsentation.
// Nach jedem Case zeigt die App die Erklärung des Bausteins, um den es in der Runde ging.

const BAUSTEINE = [
  {
    key: 'rolle', nr: 1, name: 'Rolle', kurz: 'Rolle', figur: 'rollux',
    frage: 'Aus welcher Perspektive soll die KI arbeiten?',
    so: 'Blickwinkel und Prüfauftrag nennen, nicht nur den Titel.',
    kern: 'Die Rolle legt fest, aus welchem Ausschnitt geantwortet wird, und schließt alles andere aus.',
    warum: 'Ohne festgelegte Perspektive antwortet das Modell aus dem Mittel sehr vieler Texte. Die Rolle legt fest, was für die KI bei der Aufgabe wichtig ist.',
    fehlt: 'Das Ergebnis wird allgemein und unverbindlich: eine Antwort, die zu jeder Zielgruppe halbwegs passt und zu keiner richtig. Die fachliche Schärfe fehlt, weil keine Position festgelegt ist, die das Modell einnehmen könnte.',
    beispiel: 'Du bist Datenschutzbeauftragte:r und prüfst Vertriebsprozesse.'
  },
  {
    key: 'aufgabe', nr: 2, name: 'Aufgabe', kurz: 'Aufgabe', figur: 'promptling',
    frage: 'Welche Tätigkeit soll durchgeführt werden?',
    so: 'Mit einem eindeutigen Verb beginnen: zusammenfassen, vergleichen, bewerten.',
    kern: 'Das Verb legt fest, welche Operation auf das Material angewendet wird.',
    warum: 'Thema und Material allein bestimmen das Ergebnis nicht. Erst das Verb legt fest, welche Operation auf die Inputdaten angewendet wird. Bei gleichem Ausgangstext entstehen so völlig unterschiedliche Ausgaben.',
    fehlt: 'Ohne eindeutiges Verb wählt das Modell die zum Thema häufigste Operation, meist eine allgemeine Beschreibung. Wir bekommen eine oberflächliche Erklärung über das Thema statt des Ergebnisses, das wir gebraucht hätten.',
    beispiel: 'Fasse die drei wichtigsten Regeln zum Umgang mit Kundendaten zusammen.'
  },
  {
    key: 'kontext', nr: 3, name: 'Kontext', kurz: 'Kontext', figur: 'kontextor',
    frage: 'Warum wird das Ergebnis benötigt und für wen?',
    so: 'Anlass, Adressat und dessen Vorwissen nennen.',
    kern: 'Anlass und Adressat steuern Tiefe, Länge und Tonalität stärker als jede nachträgliche Stilanweisung.',
    warum: 'Der Kontext legt fest, was als bekannt vorausgesetzt werden darf. Genau daran hängen Detailtiefe und Länge, deutlich stärker als an einer Formulierung wie "schreibe verständlich" am Ende des Prompts.',
    fehlt: 'Das Modell setzt ein durchschnittliches Publikum an und füllt den fehlenden Kontext mit Annahmen. Für Fachleute gerät der Text zu banal, für Einsteiger zu voraussetzungsreich. Die Nacharbeit beginnt beim Ton und betrifft am Ende den ganzen Text.',
    beispiel: 'Für das Onboarding neuer Kolleg:innen im Vertrieb, die kein Vorwissen mitbringen.'
  },
  {
    key: 'anforderungen', nr: 4, name: 'Anforderungen', kurz: 'Anforderungen', figur: 'schranko',
    frage: 'Was muss zwingend enthalten sein?',
    so: 'Pflichtinhalte aufzählen, und auch, was nicht vorkommen soll.',
    kern: 'Was unbestimmt bleibt, ist Raum für Interpretation: Anforderungen setzen den Rahmen.',
    warum: 'Anforderungen legen fest, was zwingend enthalten sein muss und was nicht vorkommen darf. Was unbestimmt bleibt, füllt das Modell mit dem Wahrscheinlichsten. Je klarer der Rahmen, desto weniger Raum für Interpretation und Halluzination.',
    fehlt: 'Liegen mehrere Optionen mit ähnlicher Wahrscheinlichkeit vor, legt sich das Modell nicht fest, sondern landet in der Mitte. Pflichtangaben fehlen, und ergänzte Details wirken plausibel, ohne belegt zu sein.',
    beispiel: 'Bezug auf die DSGVO, je ein Praxisbeispiel, keine Paragraphenzitate.'
  },
  {
    key: 'format', nr: 5, name: 'Ausgabeformat', kurz: 'Format', figur: 'formatix',
    frage: 'Wie soll das Ergebnis dargestellt werden?',
    so: 'Struktur und Dateitypen festlegen, nicht nur die Textsorte.',
    kern: 'Das Ausgabeformat legt fest, wie die Daten am Ende dargestellt sind.',
    warum: 'Das Format bestimmt nicht nur die Optik, sondern auch, welche Angaben überhaupt vorkommen müssen. Eine Tabelle erzwingt in jeder Zeile dieselben Felder, ein Fließtext lässt genau das offen.',
    fehlt: 'Das Modell wählt das zum Thema häufigste Format, meist Fließtext mit einer Aufzählung. Die Angaben sind dann von Durchlauf zu Durchlauf unterschiedlich sortiert und lassen sich weder vergleichen noch weiterverarbeiten.',
    beispiel: 'Drei Absätze à maximal 60 Wörter, je eine fette Überschrift.'
  },
  {
    key: 'kriterien', nr: 6, name: 'Qualitätskriterien', kurz: 'Kriterien', figur: 'kriterio',
    frage: 'Woran erkennen wir ein gutes Ergebnis?',
    so: 'Prüfbar formulieren: "verständlich ohne Fachbegriffe" statt "gut".',
    kern: 'Die Qualitätskriterien geben dem Modell einen Maßstab, nach dem es priorisiert.',
    warum: 'Die Kriterien sind ein Rahmen für die Ausgabe: Sie legen fest, welche Eigenschaften vorgehen, zum Beispiel Verständlichkeit vor Vollständigkeit oder Kürze vor Detailtiefe. Damit ist entschieden, wonach sortiert und ausgewählt wird.',
    fehlt: 'Ohne Maßstab richtet sich die Ausgabe auf allgemeine Plausibilität aus: Der Text liest sich gut und ist trotzdem nicht verwendbar. Es fehlt außerdem der Bezugspunkt, an dem sich eine zweite Fassung überhaupt ausrichten ließe.',
    beispiel: 'Verständlich ohne Fachbegriffe, sofort anwendbar, keine offenen Fragen.'
  }
];

// Abschluss nach dem letzten Case: der Qualitätscheck aus dem Training
const QUALITAETSCHECK = [
  { titel: 'Inhalt', frage: 'Stimmt, was da steht?', punkte: ['Fachlich korrekt?', 'Nichts erfunden?', 'Fakten und Annahmen getrennt?', 'Alle Anforderungen erfüllt?'] },
  { titel: 'Nutzbarkeit', frage: 'Kann ich damit arbeiten?', punkte: ['Verständlich formuliert?', 'Für die Zielgruppe geeignet?', 'Struktur verwendbar?', 'Nächste Schritte klar?'] },
  { titel: 'Risiken', frage: 'Darf ich das so verwenden?', punkte: ['Vertrauliche Daten enthalten?', 'Fachliche Prüfung nötig?', 'Entscheidet ein Mensch?', 'Einsatzbereich passend?'] }
];

const KEYS = BAUSTEINE.map((b) => b.key);
const byKey = Object.fromEntries(BAUSTEINE.map((b) => [b.key, b]));
const ALLE = 'alle'; // Fokus des Abschluss-Cases

module.exports = { BAUSTEINE, QUALITAETSCHECK, KEYS, byKey, ALLE };
