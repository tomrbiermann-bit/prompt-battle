// Voreingestellte Cases. Der Moderator kann sie in der Lobby frei bearbeiten.
// titel:    Überschrift des Cases
// aufgabe:  Was die Teilnehmer mit ihrem Prompt erreichen sollen (für alle sichtbar)
// material: Optionaler Text, der jedem Prompt beim Ausführen automatisch angehängt wird (für alle sichtbar)
// kriterien: Hinweis nur für den Schiedsrichter, woran ein gutes Ergebnis zu erkennen ist

const DEFAULT_CASES = [
  {
    titel: 'Die schwierige Absage',
    aufgabe: 'Ein langjähriger Dienstleister hat ein Angebot für ein neues Projekt abgegeben. Ihr habt euch für einen anderen Anbieter entschieden. Schreibe einen Prompt, mit dem die KI eine Absage-E-Mail verfasst, die klar ist und die gute Beziehung erhält.',
    material: '',
    kriterien: 'Gutes Ergebnis: klare Absage ohne Herumreden, wertschätzender Ton, nachvollziehbarer Grund ohne Details zum Wettbewerber, Ausblick auf künftige Zusammenarbeit, angemessene Länge für eine E-Mail.'
  },
  {
    titel: 'Ordnung ins Meeting-Chaos',
    aufgabe: 'Aus wirren Meeting-Notizen soll ein Protokoll werden, das man direkt verschicken kann. Schreibe einen Prompt, der aus dem Material unten ein sauberes Ergebnis macht. Das Material wird deinem Prompt automatisch angehängt.',
    material: 'Notizen Jour fixe Di: Budget Q4 noch offen, Sabine klärt mit Controlling bis Fr. Neues Ticketsystem: Pilot verschoben, weil Schnittstelle fehlt, IT (Marc) meldet sich. Kunde Meyer unzufrieden wg. Lieferverzug, wer ruft an??? evtl. Jonas. Sommerfest: 12.7. oder 19.7., Umfrage machen. Urlaubsplanung bitte bis Monatsende eintragen. Marc: Schulung für alle zum neuen Tool wäre gut, Termin fehlt.',
    kriterien: 'Gutes Ergebnis: klar gegliedert (Themen, Entscheidungen, Aufgaben), Aufgaben mit Verantwortlichen und Terminen, offene Punkte als solche markiert, nichts hinzuerfunden, was nicht in den Notizen steht.'
  },
  {
    titel: 'Erklär es der Geschäftsführung',
    aufgabe: 'Die Geschäftsführung will in zwei Minuten verstehen, warum KI-Sprachmodelle manchmal Dinge erfinden ("halluzinieren") und was das für den Einsatz im Unternehmen bedeutet. Schreibe einen Prompt für eine Erklärung, die bei dieser Zielgruppe ankommt.',
    material: '',
    kriterien: 'Gutes Ergebnis: verständlich ohne Fachjargon, kurz genug für zwei Minuten, ein anschauliches Bild oder Beispiel, konkrete Konsequenz für den Arbeitsalltag, sachlich richtig und ohne Panikmache.'
  },
  {
    titel: 'Der Blick in die Zahlen',
    aufgabe: 'Du bekommst eine kleine Umsatztabelle und sollst der Teamleitung sagen, was auffällt und was zu tun ist. Schreibe einen Prompt, der aus dem Material unten eine brauchbare Auswertung macht. Das Material wird deinem Prompt automatisch angehängt.',
    material: 'Region;Q1;Q2;Q3;Q4\nNord;120;125;131;138\nSüd;210;190;172;150\nOst;80;82;140;85\nWest;95;97;96;99\n(Umsatz in Tausend Euro)',
    kriterien: 'Gutes Ergebnis: erkennt den Abwärtstrend im Süden und den Ausreißer im Osten in Q3, rechnet korrekt, trennt Beobachtung von Vermutung, endet mit wenigen konkreten Empfehlungen oder Rückfragen, übersichtliches Format.'
  },
  {
    titel: 'Die Ideenmaschine',
    aufgabe: 'Euer Team (14 Personen, gemischtes Alter, zwei arbeiten remote) plant ein Teamevent. Budget: 600 Euro, Dauer: ein Nachmittag. Schreibe einen Prompt, der Ideen liefert, mit denen ihr wirklich etwas anfangen könnt.',
    material: '',
    kriterien: 'Gutes Ergebnis: Ideen halten Budget, Dauer und Gruppengröße ein, beziehen die Remote-Kollegen ein, sind abwechslungsreich statt austauschbar, enthalten genug Details (Kosten, Aufwand) für eine Entscheidung.'
  },
  {
    titel: 'Der kritische Blick',
    aufgabe: 'Du hast den Konzeptentwurf unten geschrieben und willst ihn härter prüfen lassen, als es ein freundlicher Kollege tun würde. Schreibe einen Prompt, der echte Schwachstellen findet. Das Material wird deinem Prompt automatisch angehängt.',
    material: 'Konzept: Wir führen ab nächstem Monat einen KI-Chatbot für alle Kundenanfragen ein. Der Chatbot beantwortet Fragen rund um die Uhr, dadurch sparen wir zwei Stellen im Service. Die Antworten werden nicht kontrolliert, weil die KI aus unseren alten E-Mails lernt. Eine Testphase ist nicht nötig, da der Anbieter gute Referenzen hat.',
    kriterien: 'Gutes Ergebnis: findet die echten Risiken (keine Kontrolle, kein Test, Datenschutz bei alten E-Mails, unbelegte Einsparung), priorisiert sie, bleibt konstruktiv mit konkreten Verbesserungsvorschlägen, statt nur zu loben oder nur zu zerreißen.'
  }
];

module.exports = { DEFAULT_CASES };
