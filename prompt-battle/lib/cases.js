// Voreingestellte Cases: sechs Mini Cases und der Final Case.
// Jeder Mini Case führt auf einen Baustein des Prompt-Baukastens hin. Nach der Runde zeigt die App dessen Erklärung.
// Der Moderator kann alles in der Lobby (und zwischen den Runden) bearbeiten.
//
// So sind die Cases gebaut:
//   1. Jeder Case hat eine Falle, an der man im Ergebnis sieht, ob der Baustein der Runde im Prompt stand
//      (Fachsprache, Smalltalk, falsches Publikum, ein Name, der nicht raus darf, eine Lücke, zu viel Stoff).
//   2. Alles, was die KI wissen muss, steht im Material. Niemand muss etwas erfinden, auch die KI nicht.
//   3. Die Vergleichs-Prompts bauen aufeinander auf: "ohne" enthält die Bausteine der früheren Runden,
//      "mit" fügt genau den Baustein der Runde hinzu. So wächst der Prompt von Runde zu Runde.
//   4. Die Situation verrät den Baustein nicht, liefert aber alles, was man für ihn braucht.
//
// titel:      Überschrift des Cases
// aufgabe:    Situation und Auftrag (für alle sichtbar)
// material:   Text, der jedem Prompt beim Ausführen automatisch angehängt wird (für alle sichtbar)
// fokus:      Baustein der Runde: rolle, aufgabe, kontext, anforderungen, format, kriterien,
//             alle (Abschluss-Case) oder leer (keine Erklärung nach der Runde)
// stichworte: Fakten aus dem Case, die ein guter Prompt aufgreift. Alternativen mit | trennen.
// kriterien:  Hinweis für den KI-Schiedsrichter, woran ein gutes Ergebnis zu erkennen ist
// ohne, mit:  Vergleichs-Prompts für die Erklärung nach der Runde
// debrief:    Frage an die Runde, erscheint in der Erklärung
// minuten:    eigene Schreibzeit für diesen Case (leer = Zeit aus den Einstellungen)
//
// Alle Namen, Zahlen und Termine im Material sind für das Training erfunden.

const ROLLE_1 = 'Du arbeitest in der Anwohnerkommunikation der Stadtwerke und prüfst jeden Satz darauf, ob ihn ein verärgerter Anwohner ohne Fachwissen versteht und sich ernst genommen fühlt.';
const ROLLE_2 = 'Du bist Projektassistenz im App-Team und kennst die Beteiligten und ihre Zuständigkeiten.';
const BASIS_3 = 'Du bist IT-Controller der Stadtverwaltung und prüfst Investitionen auf Kosten und Risiken. Vergleiche das Cloud-Angebot mit den eigenen Servern und leite eine Empfehlung ab.';
const BASIS_4 = 'Du bist Kommunikationsprofi im Projektbüro und achtest darauf, dass ein Update in einer Minute gelesen ist. Schreibe aus meinen Notizen das wöchentliche Status-Update zur Ticketing-App. Kontext: Es geht in den Teams-Kanal meiner Abteilung, die Kolleginnen und Kollegen kennen das Projekt.';
const BASIS_5 = 'Du bist IT-Einkäufer der Stadtwerke und bewertest Software danach, was sie über die Jahre kostet und wie gut sie zu SAP passt. Vergleiche die drei E-Akte-Anbieter aus meinen Notizen. Kontext: Meine Bereichsleiterin entscheidet morgen und kennt die Anbieter noch nicht. Anforderungen: Nenne für jeden Anbieter die Einführungskosten, die laufenden Kosten bei 400 Nutzern, die Dauer der Einführung, die SAP-Schnittstelle und den Support. Gib am Ende eine begründete Empfehlung. Bewerte nur diese drei Anbieter, keine weiteren.';
const BASIS_6 = 'Du bist Referentin der Geschäftsführung und achtest darauf, dass Gremienvorlagen auch für Nicht-Techniker lesbar sind. Fasse den Auszug aus der Vorlage zusammen. Kontext: Der Aufsichtsrat entscheidet nächste Woche über das Projekt. Die Kurzfassung steht auf dem Deckblatt der Vorlage, viele Mitglieder lesen zuerst nur sie. Anforderungen: Die Gesamtkosten und die Frist für den Förderantrag müssen vorkommen. Gib keine Empfehlung ab, die Entscheidung liegt beim Aufsichtsrat. Ausgabeformat: ein Absatz mit höchstens 120 Wörtern.';

const DEFAULT_CASES = [
  {
    titel: 'Bad News!',
    fokus: 'rolle',
    aufgabe: 'Die Fernwärme-Baustelle in der Lindenstraße dauert drei Wochen länger. Die Anwohner leben seit Monaten mit Lärm und Halteverbot und müssen jetzt informiert werden. Von der Bauleitung hast du nur die Notiz unten bekommen. Schreibe einen Prompt, mit dem die KI daraus den Brief an die Anwohner macht. Die Notiz wird deinem Prompt automatisch angehängt.',
    material: 'Notiz der Bauleitung (für das Training erfunden):\nBA 2 Lindenstraße, Hausnr. 12 bis 48, FW-Trasse DN 300.\nBeim Aushub nicht dokumentierte Altsparten und Fundamentreste angetroffen. Verbau muss angepasst werden, Umverlegung nötig.\nFertigstellung verschiebt sich von KW 46 auf KW 49, neu: 5. Dezember statt 14. November.\nHalteverbotszone bleibt bis Bauende. Zufahrt zu den Grundstücken jederzeit gewährleistet, Müllabfuhr unverändert.\nRückfragen: Baustellen-Telefon 089 99998 123, werktags 8 bis 18 Uhr.\nAbsender: Stadtwerke, Projektkommunikation Fernwärme.',
    stichworte: ['anwohner|anlieger|bewohner|nachbar', 'fernwärme|baustelle', 'drei wochen|3 wochen|verzöger|verschieb|verspät|länger', 'brief|schreiben|anschreiben|mitteilung|information', 'notiz|bauleitung|fachsprache|fachbegriff|fachwissen|jargon|verständlich'],
    kriterien: 'Die Falle ist die Notiz der Bauleitung: Fachsprache und kein Wort des Bedauerns. Gutes Ergebnis: Der Brief übersetzt sie in Alltagssprache (Wörter wie Altsparten, Verbau, DN 300, BA 2 oder KW kommen nicht vor), nennt die Verzögerung, den neuen Termin 5. Dezember, den Grund und die Folgen klar, nimmt den Ärger der Anwohner ernst und übernimmt Verantwortung ohne Ausreden, nennt das Baustellen-Telefon und erfindet nichts dazu. Ein Brief im Ton der Bauleitung ist klar schlechter.',
    ohne: 'Schreibe aus der Notiz einen Brief an die Anwohner, dass die Fernwärme-Baustelle drei Wochen länger dauert.',
    mit: ROLLE_1 + ' Schreibe aus der Notiz einen Brief an die Anwohner, dass die Fernwärme-Baustelle drei Wochen länger dauert.',
    debrief: 'Was hätte die KI als Bauleiter aus derselben Notiz gemacht, was als Juristin? Woran würdet ihr im Brief erkennen, aus welcher Rolle er geschrieben ist?'
  },
  {
    titel: 'Das unstrukturierte Meeting',
    fokus: 'aufgabe',
    aufgabe: 'Du kommst aus einem chaotischen Brainstorming zur neuen Kunden-App. Mitgeschrieben hat niemand, du hast nur das automatische Transkript aus Teams. Morgen früh soll das Team damit weiterarbeiten können. Schreibe einen Prompt dafür. Das Transkript wird deinem Prompt automatisch angehängt.',
    material: 'Transkript (für das Training erfunden):\n[00:01] Jonas: Kaffee ist übrigens schon wieder leer\n[00:02] Markus: ok also die App, Zählerstand per Foto, das will ich auf jeden Fall drin haben\n[00:03] Aylin: aber nicht im ersten Release, das hatten wir gesagt, erst Login und Rechnungsübersicht\n[00:03] Markus: stimmt, dann Foto in Release zwei, einverstanden\n[00:05] Petra: wer redet mit dem Datenschutz wegen der Fotos\n[00:05] Aylin: mach ich, bis nächsten Mittwoch\n[00:07] Jonas: wir brauchen 20 Kunden für den Test, ich frag den Kundenservice, bis Ende des Monats\n[00:09] Markus: das Budget für die Agentur ist noch nicht freigegeben, Petra, hakst du nach\n[00:09] Petra: ja, sobald ich die Zahlen von Jonas hab\n[00:11] Markus: Push-Nachrichten bei Störungen, wollen wir das?\n[00:12] Aylin: gute Idee, aber heute nicht entscheiden\n[00:13] Petra: und die Schulung für den Kundenservice, macht das jemand?\n[00:13] Markus: müssen wir noch klären\n[00:14] Jonas: nächstes Treffen in zwei Wochen',
    stichworte: ['transkript|meeting|mitschrift|brainstorming|besprechung', 'entscheidung|beschl|entschieden|vereinbar|festgelegt', 'action item|aufgabe|to[- ]?do|nächste schritte|maßnahme', 'verantwortlich|zuständig|\\bwer\\b|person', 'termin|frist|bis wann|datum|deadline|fällig', 'offen|ungeklärt|unklar|klären'],
    kriterien: 'Die Falle: Eine bloße Kürzung erzählt das Meeting nach und verliert, wer was bis wann tut. Gutes Ergebnis: Entscheidungen (Release 1 mit Login und Rechnungsübersicht, Foto-Funktion erst in Release 2), Aufgaben mit Verantwortlichen und Terminen (Aylin klärt den Datenschutz bis Mittwoch, Jonas besorgt 20 Testkunden bis Monatsende, Petra hakt beim Budget nach, sobald die Zahlen von Jonas da sind), offene Punkte als offen markiert (Push-Nachrichten, Schulung für den Kundenservice ohne Verantwortlichen), Smalltalk weggelassen, nichts erfunden. Wer der Schulung einen Verantwortlichen andichtet, hat verloren.',
    ohne: ROLLE_2 + ' Hier ist das Transkript von unserem Meeting. Kannst du mir damit helfen?',
    mit: ROLLE_2 + ' Extrahiere aus dem Transkript alle getroffenen Entscheidungen und alle Aufgaben, ordne jede Aufgabe der verantwortlichen Person zu, nenne den Termin und liste auf, was offen geblieben ist.',
    debrief: 'Was macht die KI aus demselben Transkript bei "kürze", bei "fasse zusammen" und bei "extrahiere"? Und wem ist die Schulung ohne Verantwortlichen aufgefallen?'
  },
  {
    titel: 'Pitch vor dem Stadtrat',
    fokus: 'kontext',
    aufgabe: 'Die Stadtverwaltung hat prüfen lassen, ob Büro- und Archivdaten ohne Personenbezug von den veralteten eigenen Servern zu einem Cloud-Anbieter umziehen sollen. Morgen stellst du das Ergebnis im Stadtrat vor und hast dafür zwei Minuten. Die Stadträte sind keine IT-Fachleute, sie schauen vor allem auf Kosten und Datenschutz. Schreibe einen Prompt, der dir den Pitch liefert. Die Eckdaten werden deinem Prompt automatisch angehängt.',
    material: 'Eckdaten der Prüfung (für das Training erfunden):\nBetroffen sind nur Büro- und Archivdaten ohne Personenbezug.\nEigene Server: 9 Jahre alt. Ersatz kostet einmalig rund 400.000 Euro, der Betrieb rund 120.000 Euro pro Jahr.\nCloud-Angebot: rund 85.000 Euro pro Jahr, keine Anschaffung, jährlich kündbar.\nÜber fünf Jahre gerechnet: eigene Server rund 1.000.000 Euro, Cloud rund 425.000 Euro.\nTechnik und Recht: Rechenzentren in Frankfurt und Nürnberg (georedundant), Zertifizierung nach ISO 27001, Auftragsverarbeitung nach Art. 28 DSGVO, SLA 99,9 Prozent.\nRisiken: Abhängigkeit vom Anbieter. Der Umzug dauert etwa vier Monate.\nErgebnis der Prüfung: Empfehlung für die Cloud.',
    stichworte: ['cloud', 'server|on-?premise|rechenzentrum|eckdaten|umzug|prüfung', 'stadtrat|stadträt', 'minute|pitch|vortrag|rede', 'kosten|datenschutz', 'it-fach|fachleute|expert|laien|hintergrund|vorwissen|kenntnis|technisch|fachbegriff|verständlich'],
    kriterien: 'Die Falle sind die Fachbegriffe in den Eckdaten (georedundant, ISO 27001, Art. 28 DSGVO, SLA). Gutes Ergebnis: in zwei Minuten sprechbar (höchstens etwa 300 Wörter), für Zuhörer ohne IT-Wissen verständlich, Fachbegriffe übersetzt oder weggelassen, Kosten und Datenschutz im Mittelpunkt, klare Empfehlung, nur Zahlen aus den Eckdaten. Eine lange, technische Evaluation ist klar schlechter.',
    ohne: BASIS_3,
    mit: BASIS_3 + ' Kontext: Ich stelle das Ergebnis morgen im Stadtrat vor und habe zwei Minuten. Die Stadträte sind keine IT-Fachleute und achten vor allem auf Kosten und Datenschutz.',
    debrief: 'Dieselben Eckdaten, aber für die IT-Leitung statt für den Stadtrat: Was stünde dann im Kontext, und was würde sich am Ergebnis ändern?'
  },
  {
    titel: 'Status-Update',
    fokus: 'anforderungen',
    minuten: 5,
    aufgabe: 'Du schreibst das wöchentliche Update zur Einführung der neuen ÖPNV-Ticketing-App für den Teams-Kanal deiner Abteilung. Deine Abteilungsleiterin fragt jede Woche zuerst nach dem Budget und nach Apple Pay. Zur Trennung vom externen Entwickler-Team ist vereinbart: Der Firmenname wird intern nicht genannt. Schreibe einen Prompt für das Update. Deine Notizen werden automatisch angehängt.',
    material: 'Notizen KW 46 (für das Training erfunden):\nBudget: 310.000 von 420.000 Euro verbraucht (74 Prozent).\nApple-Pay-Integration verzögert sich um zwei Wochen, neuer Termin 2. Dezember.\nGoogle Pay läuft seit Montag im Test.\nBetatest mit 150 Nutzern, Bewertung im Schnitt 4,1 von 5.\nDie Zusammenarbeit mit dem externen Entwickler-Team Nordlicht Apps wurde letzte Woche beendet. Die Übergabe an das interne Team läuft.\nNächster Meilenstein: Freigabe im App Store, geplant für den 9. Dezember.',
    stichworte: ['status|update', 'ticketing|\\bapp\\b', 'budget', 'apple', 'entwickler|extern|dienstleister|agentur|firma|firmenname|nordlicht', 'teams-kanal|kanal|channel|abteilung'],
    kriterien: 'Die Falle: Der Name "Nordlicht Apps" steht in den Notizen. Gutes Ergebnis: kurzes Update für einen Teams-Kanal, Budgetstand (310.000 von 420.000 Euro) und Apple-Pay-Verzögerung (zwei Wochen, neuer Termin 2. Dezember) kommen vor, der Name des externen Teams kommt nicht vor, nichts erfunden. Ein Ergebnis, das "Nordlicht Apps" nennt, verliert, egal wie gut es sonst ist.',
    ohne: BASIS_4,
    mit: BASIS_4 + ' Anforderungen: Nenne zwingend den Budgetstand und die Verzögerung bei Apple Pay mit dem neuen Termin. Nenne unter keinen Umständen den Firmennamen des externen Entwickler-Teams.',
    debrief: 'Der Firmenname stand in den Notizen. Was macht eine KI mit einer Information, die nicht in den Kanal soll, wenn ihr nichts dazu sagt?'
  },
  {
    titel: 'Der Anbietervergleich',
    fokus: 'format',
    minuten: 5,
    aufgabe: 'Du hast drei Software-Anbieter für die digitale Akte (E-Akte) recherchiert. Deine Bereichsleiterin will die drei morgen auf einer einzigen Folie vergleichen, erwartet deine Empfehlung und entscheidet danach. Schreibe einen Prompt, der aus deinen Notizen den Inhalt für diese Folie macht. Die Notizen werden automatisch angehängt.',
    material: 'Recherche-Notizen, unsortiert (Anbieter und Zahlen für das Training erfunden):\nWir rechnen mit rund 400 Nutzern.\nAktaFlow: sehr gute Suche, SAP-Schnittstelle vorhanden. Einführung dauert etwa 9 Monate und kostet rund 180.000 Euro. Laufend 14 Euro pro Nutzer und Monat. Support nur per Ticket.\nDocuNord: 19 Euro pro Nutzer und Monat, fester Ansprechpartner. Einfach zu bedienen. SAP-Schnittstelle kostet extra, rund 30.000 Euro. Einführung rund 120.000 Euro, etwa 5 Monate.\nVerwalto: günstigster Einstieg mit rund 95.000 Euro, in etwa 4 Monaten eingeführt. Keine SAP-Schnittstelle. 22 Euro pro Nutzer und Monat. Zwei Referenzkunden aus der Energiebranche.',
    stichworte: ['vergleich|gegenüber', 'anbieter|aktaflow|docunord|verwalto', 'e-?akte|akte|software', 'bereichsleit|führungskraft|chef|leitung|vorgesetzt', 'folie|slide|one-?pager', 'kosten|sap|support|dauer', 'empfehl'],
    kriterien: 'Die Falle: Die Notizen nennen die Angaben je Anbieter in anderer Reihenfolge, und zum Support von Verwalto steht nichts darin. Gutes Ergebnis: passt auf eine Folie, dieselben Felder für alle drei Anbieter (Einführungskosten, laufende Kosten bei 400 Nutzern, Dauer, SAP-Schnittstelle, Support), am besten als Tabelle, die fehlende Angabe zum Support von Verwalto ist als fehlend markiert statt erfunden oder übergangen, danach eine kurze begründete Empfehlung, Zahlen nur aus den Notizen oder daraus gerechnet. Ein Fließtext, in dem die Lücke untergeht, ist klar schlechter.',
    ohne: BASIS_5,
    mit: BASIS_5 + ' Ausgabeformat: Inhalt für genau eine Folie. Zuerst eine Tabelle mit den Spalten Anbieter, Einführungskosten, laufende Kosten, Dauer, SAP-Schnittstelle, Support. Darunter die Empfehlung in maximal 3 Stichpunkten. Fehlt in den Notizen eine Angabe, steht in der Zelle "keine Angabe".',
    debrief: 'Zum Support von Verwalto steht nichts in den Notizen. Warum fällt das in einer Tabelle sofort auf und in einem Fließtext nicht?'
  },
  {
    titel: 'Beschlussvorlage',
    fokus: 'kriterien',
    minuten: 6,
    aufgabe: 'Der Aufsichtsrat entscheidet nächste Woche über eine neue Großwärmepumpe. Du schreibst die Kurzfassung für das Deckblatt der Vorlage, höchstens 120 Wörter. Der Auszug unten enthält mehr, als hineinpasst. Die Vorsitzende will jede Zahl in der Vorlage nachschlagen können und sagt: "Lieber drei Punkte, die für die Entscheidung zählen, als neun halbe." Schreibe einen Prompt für die Kurzfassung. Der Auszug wird deinem Prompt automatisch angehängt.',
    material: 'Auszug aus der Vorlage (für das Training erfunden):\n[Seite 4] Geplant ist eine Großwärmepumpe am Klärwerk mit 30 Megawatt Wärmeleistung, genug für rund 20.000 Haushalte.\n[Seite 7] Gesamtkosten: 86 Millionen Euro. Davon sollen 24 Millionen Euro aus einem Bundesförderprogramm kommen. Der Förderantrag muss bis zum 31. März gestellt sein.\n[Seite 9] Verzögert sich die Lieferung der Verdichter, tragen die Stadtwerke Mehrkosten bis 3 Millionen Euro selbst.\n[Seite 12] Die Genehmigung dauert nach Erfahrung der Verwaltung 10 bis 14 Monate.\n[Seite 15] Die Anlage ersetzt Erdgas und spart rund 38.000 Tonnen CO2 pro Jahr.\n[Seite 18] Laut Lärmgutachten werden die Grenzwerte nachts nur mit zusätzlichem Schallschutz eingehalten (1,2 Millionen Euro, in den Gesamtkosten enthalten).\n[Seite 20] Der Stromanschluss muss verstärkt werden. Der Netzbetreiber nennt dafür 18 Monate Bauzeit.\n[Seite 23] Die Inbetriebnahme ist für das vierte Quartal 2029 geplant. Zur Entwicklung der Wärmepreise macht die Vorlage keine Aussage.\n[Seite 26] Der Alternativstandort Nord wäre 9 Millionen Euro teurer.',
    stichworte: ['zusammenfass|fasse|kurzfassung|summary', 'vorlage|auszug|dokument', 'aufsichtsrat|gremium|vorsitzende', '120', 'kosten|förder|frist|risik|zahl|entscheidung', 'seite|beleg|quelle|nachschlag'],
    kriterien: 'Die Falle: neun Punkte, aber nur 120 Wörter, und zu den Wärmepreisen sagt die Vorlage nichts. Gutes Ergebnis: höchstens 120 Wörter, erkennbar priorisiert auf das, was für die Entscheidung zählt (Kosten 86 Millionen Euro, Förderung 24 Millionen Euro mit Frist 31. März, dazu die größten Risiken wie Mehrkosten bis 3 Millionen Euro, Genehmigungsdauer oder Stromanschluss), jede Zahl mit Seitenangabe, keine Aussage über den Auszug hinaus, verständlich ohne Fachbegriffe. Keine Prognose oder Annahme zu Wärmepreisen. Der Hinweis, dass die Vorlage dazu nichts sagt, ist erlaubt. Ein Text, der alle neun Punkte gleichmäßig anreißt, die Wortgrenze reißt oder Zahlen ohne Seitenangabe nennt, ist klar schlechter.',
    ohne: BASIS_6 + ' Mach es gut und professionell.',
    mit: BASIS_6 + ' Qualitätskriterien: Was für die Entscheidung zählt, geht vor Vollständigkeit. Jede Zahl ist mit der Seitenangabe belegt. Es steht nichts in der Kurzfassung, was nicht im Auszug steht, auch keine Prognosen. Der Text ist verständlich ohne Fachbegriffe.',
    debrief: 'Neun Punkte, 120 Wörter: Wer entscheidet, was wegfällt, wenn ihr der KI keinen Maßstab nennt? Und woran würdet ihr eine zweite Fassung messen?'
  },
  {
    titel: 'Final Case: Risikoanalyse',
    fokus: 'alle',
    minuten: 8,
    aufgabe: 'Zwei kommunale Unternehmen sollen fusionieren. Du hast Notizen aus drei Interviews: Betriebsrat, IT-Leitung und kaufmännische Geschäftsführung. Morgen früh tagt das Steering Committee mit beiden Geschäftsführungen und Vertretern des Stadtrats. Die Mitglieder haben wenig Zeit und wollen wissen, wie kritisch die finanziellen, technischen und personellen Risiken sind und wo sie handeln müssen. Lies genau: Nicht alles in den Notizen passt zusammen, und die Namen der Interviewten dürfen im Ergebnis nicht stehen. Schreibe einen Prompt, der diese Risikobewertung liefert. Jetzt zählt der ganze Baukasten. Die Notizen werden deinem Prompt automatisch angehängt.',
    material: 'Interviewnotizen (für das Training erfunden):\nFrau Demir, Betriebsrat: Zwei verschiedene Tarifverträge, Angleichung ungeklärt. Sorge vor Stellenabbau in der Verwaltung. "Die Stimmung ist schlecht und kippt endgültig, wenn bis Januar keine klare Aussage kommt." Drei erfahrene Netzmeister denken über einen Wechsel nach.\nHerr Brandt, IT-Leitung: Zwei ERP-Systeme. Die Migration dauert 18 bis 24 Monate und kostet "sicher 4 Millionen Euro". Die Wartung des Abrechnungssystems von Unternehmen B endet 2027. Bei paralleler Abrechnung drohen falsche Kundenrechnungen.\nFrau Okafor, kaufmännische Geschäftsführerin: Einmalkosten der Fusion 6 Millionen Euro, die IT-Migration ist darin mit 1,5 Millionen Euro eingeplant. Synergien laut Businessplan 3,5 Millionen Euro pro Jahr, "davon ist höchstens die Hälfte belegt". Pensionsrückstellungen von Unternehmen A noch nicht geprüft. "Vom Personal höre ich, dass die Stimmung gut ist."',
    stichworte: ['risik', 'fusion|zusammenschluss', 'interview|notizen', 'steering|committee|lenkungs|geschäftsführung|stadtrat|stadträt|entscheider', 'finanz|technisch|\\bit\\b|personell|personal', 'anonym|namen|klarname|nur funktion', 'widerspr|beleg|annahme|schätzung|unstimmig|diskrepanz|inkonsisten|vermutung|fakten'],
    kriterien: 'Die Fallen: zwei Widersprüche (IT-Migration: 4 Millionen Euro laut IT-Leitung, 1,5 Millionen Euro im Plan; Stimmung: schlecht laut Betriebsrat, "gut" laut Hörensagen der Geschäftsführerin), unbelegte Zahlen (Synergien nur zur Hälfte belegt, die 4 Millionen Euro sind eine Schätzung) und drei Namen. Gutes Ergebnis: Risiken getrennt nach finanziell, technisch und personell, Kritikalität bewertet, Handlungsbedarf genannt, für Entscheider mit wenig Zeit aufbereitet (zum Beispiel Kurzfassung und Tabelle). Die Widersprüche sind benannt statt geglättet, Unbelegtes ist als unbelegt markiert, die Namen Demir, Brandt und Okafor kommen nicht vor. Nichts wird erfunden. Schlüsse aus den Notizen, die als Ableitung gekennzeichnet sind, sind ein Plus (zum Beispiel: Die Migration endet erst nach dem Wartungsende 2027, oder: Stimmt die Schätzung der IT, liegen die Einmalkosten über Plan).',
    ohne: 'Hier sind die Notizen aus den Interviews zur Fusion. Bitte fasse die wichtigsten Risiken für das Meeting morgen zusammen und mach eine Tabelle draus. Kling professionell.',
    mit: '[Rolle] Du bist Risikomanager für Fusionen kommunaler Unternehmen und prüfst jede Aussage darauf, ob sie belegt ist oder nur eine Einschätzung.\n[Aufgabe] Analysiere die Interviewnotizen und extrahiere die zentralen Risiken der Fusion.\n[Kontext] Das Ergebnis geht morgen früh an das Steering Committee mit beiden Geschäftsführungen und Stadträten. Die Mitglieder haben wenig Zeit und kennen die Interviews nicht.\n[Anforderungen] Unterscheide zwingend zwischen finanziellen, technischen und personellen Risiken. Bewerte für jedes Risiko die Kritikalität und nenne den Handlungsbedarf. Anonymisiere alle Personen (zum Beispiel "IT-Leitung") und nenne keine Namen.\n[Ausgabeformat] Ein One-Pager: zuerst eine Kurzfassung in 3 Stichpunkten, danach eine Tabelle mit den Spalten Kategorie, Risiko, Kritikalität, Beleg, Handlungsbedarf.\n[Qualitätskriterien] Fakten und Annahmen sind getrennt. Widersprüche zwischen den Interviews werden benannt, nicht geglättet. Es steht nichts im Ergebnis, was nicht in den Notizen steht. Eigene Schlüsse sind als Ableitung gekennzeichnet.',
    debrief: 'Hätte euer Prompt die beiden Widersprüche und die unbelegten Zahlen abgefangen? Welcher Baustein leistet das?'
  }
];

module.exports = { DEFAULT_CASES };
