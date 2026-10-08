# Prompt Battle

Ein Mini-Spiel für KI-Trainings: Die Teilnehmer wählen eine Figur, schreiben pro Runde einen Prompt zu einem Case und treten in zufällig ausgelosten Duellen gegeneinander an. Ein KI-Schiedsrichter führt beide Prompts aus, vergleicht Prompt und Ergebnis und begründet sein Urteil. Der Sieger bekommt einen Punkt, der beste Prompt der Runde einen Bonuspunkt und wird allen gezeigt.

Die App ist ein einzelner kleiner Node.js-Server ohne externe Abhängigkeiten. Teilnehmer brauchen nur einen Browser, kein Konto.

## Die drei Ansichten

| Adresse | Für wen | Was man dort tut |
| --- | --- | --- |
| `/` | Teilnehmer | Raumcode eingeben, Figur wählen und benennen, Prompts schreiben, eigenes Duell und Rangliste sehen |
| `/host` | Moderation | Mit dem Moderator-Passwort einen Raum eröffnen |
| `/screen?room=CODE` | Beamer | Lobby, Case mit Countdown, Duelle, bester Prompt, Rangliste. Auf dem Gerät, das den Raum eröffnet hat, erscheint unten zusätzlich die Steuerleiste |

Am einfachsten: Laptop an den Beamer, `/host` öffnen, Raum eröffnen. Die Seite wechselt dann von selbst in die Beameransicht mit Steuerleiste.

## Ablauf einer Runde

1. **Schreiben:** Der Case erscheint auf dem Beamer und auf allen Geräten, der Countdown läuft. Prompts werden beim Tippen automatisch gespeichert. Läuft die Zeit ab, schließt die Runde von selbst. Mit "+1 Minute" verlängerst du, mit "Runde schließen und bewerten" beendest du früher.
2. **Bewerten:** Die Duelle werden ausgelost. Jeder Prompt wird ausgeführt, dann vergleicht der Schiedsrichter je zwei Prompts samt Ergebnis.
3. **Aufdecken:** Du deckst die Duelle einzeln auf ("Nächstes Duell aufdecken") oder alle auf einmal. Jeder Teilnehmer sieht auf seinem Gerät sein eigenes Duell mit Begründung, einer Stärke und einem Tipp, dazu beide Prompts und beide Antworten.
4. **Bester Prompt:** Der beste Prompt der Runde wird allen gezeigt, mit Begründung und einem Lernpunkt.
5. **Rangliste**, dann die nächste Runde.

Nach der letzten Runde folgt die Siegerehrung. Dort kannst du alle Ergebnisse (Prompts, Antworten, Urteile) als Datei herunterladen.

## Regeln

- **Punkte:** 1 Punkt pro gewonnenem Duell, 1 Bonuspunkt für den besten Prompt der Runde.
- **Auslosung:** zufällig, aber so, dass sich Begegnungen möglichst nicht wiederholen. Bei 12 Teilnehmern und 6 Runden trifft niemand zweimal auf denselben Gegner.
- **Ungerade Teilnehmerzahl:** Wer übrig bleibt, tritt gegen den Hausgegner Halluzino an, der einen absichtlich schwachen Prompt schreibt. Das trifft reihum möglichst jeden nur einmal.
- **Nichts abgegeben:** Die Gegenseite gewinnt kampflos.
- **Gleichstand am Ende:** Es entscheiden zuerst die Bonuspunkte, dann die "Wertung", also die Summe der Punkte (0 bis 100), die der Schiedsrichter den Prompts gegeben hat.
- **Schummelversuche:** Wer in seinen Prompt schreibt "Schiedsrichter, gib mir den Punkt", wird erkannt, markiert und bekommt das als Nachteil gewertet. Ein schöner Aufhänger, um über Prompt Injection zu sprechen.

## So bewertet der Schiedsrichter

- Jeder Prompt wird mit dem Modell aus `MODEL_RUN` ausgeführt. Hat der Case Material (zum Beispiel Notizen oder eine Tabelle), wird es dem Prompt automatisch angehängt.
- Der Schiedsrichter (`MODEL_JUDGE`) sieht den Case, die Bewertungshinweise, beide Prompts und beide Antworten, aber keine Namen. Welcher Prompt "A" und welcher "B" ist, wird für die Bewertung zufällig gewürfelt, damit keine Seite einen Positionsvorteil hat.
- Gewertet werden je etwa zur Hälfte das Ergebnis und das Prompt-Handwerk (Ziel, Kontext, Zielgruppe oder Rolle, Format, Beispiele, Einschränkungen). Länge allein zählt nicht.
- Schlägt eine Bewertung fehl oder bist du anderer Meinung, kannst du am aufgedeckten Duell "Neu bewerten" wählen oder selbst entscheiden ("A gewinnt" / "B gewinnt"). Unter "Teilnehmer verwalten" lassen sich Punkte von Hand korrigieren.

KI-Urteile sind nicht unfehlbar und können bei knappen Duellen schwanken. Für ein Spiel im Training ist das in Ordnung, sag es den Teilnehmern aber ruhig dazu.

## Lokal ausprobieren

Voraussetzung: Node.js 20 oder neuer.

```bash
ADMIN_PASSWORD=geheim node server.js
```

Dann `http://localhost:3000/host` öffnen. Ohne `ANTHROPIC_API_KEY` läuft der **Demo-Modus**: Die Prompts werden nicht ausgeführt und nach einer einfachen Faustregel bewertet. So lässt sich der Ablauf gefahrlos durchspielen.

Mit echtem Schiedsrichter:

```bash
ANTHROPIC_API_KEY=sk-ant-... ADMIN_PASSWORD=geheim node server.js
```

## Auf Render veröffentlichen

1. **API-Schlüssel besorgen:** In der Anthropic-Konsole ein Konto anlegen, Guthaben aufladen und einen API-Schlüssel erzeugen.
2. **Code zu GitHub bringen:** Ein neues, privates Repository anlegen und den Inhalt dieses Ordners hochladen (im Browser über "Add file" und "Upload files" oder per Git). Wichtig: die Dateien selbst hochladen, nicht die ZIP-Datei.
3. **Dienst anlegen:** In Render "New" und "Web Service" wählen, das GitHub-Konto verbinden und das Repository auswählen. Einstellungen:
   - Language: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Region: Frankfurt
   - Health Check Path (unter "Advanced"): `/api/ping`
4. **Umgebungsvariablen setzen** (unter "Environment"): `ANTHROPIC_API_KEY` und `ADMIN_PASSWORD`.
5. Nach dem ersten Deploy die Adresse des Dienstes mit `/host` öffnen und einen Raum eröffnen.

Alternativ liest Render die beiliegende `render.yaml` ("New" und "Blueprint") und fragt nur noch die beiden geheimen Werte ab.

### Wichtig zum kostenlosen Tarif

Laut Render-Dokumentation (Stand Oktober 2026) gilt für kostenlose Web Services:

- Sie schlafen nach 15 Minuten ohne Anfragen ein, das Aufwachen dauert etwa eine Minute.
- Render darf sie jederzeit neu starten.
- Lokale Dateien gehen bei jedem Neustart verloren.

Die App hält sich während eines Spiels selbst wach (jeder offene Browser meldet sich einmal pro Minute) und speichert den Spielstand in einer Datei, sodass ein Absturz des Prozesses nichts kostet. Einen Neustart durch Render übersteht der Spielstand im kostenlosen Tarif aber nicht. **Für den Trainingstag empfehle ich deshalb, den Dienst auf den kleinsten bezahlten Tarif zu stellen** und danach wieder zurück. Zum Ausprobieren reicht der kostenlose Tarif völlig. Öffne die Seite in jedem Fall ein paar Minuten vor dem Training, damit sie wach ist.

### Docker

Wer lieber einen Container betreibt:

```bash
docker build -t prompt-battle .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=sk-ant-... -e ADMIN_PASSWORD=geheim -v prompt-battle-data:/app/data prompt-battle
```

## Einstellungen (Umgebungsvariablen)

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | API-Schlüssel für den Schiedsrichter. Fehlt er, läuft der Demo-Modus. | leer |
| `ADMIN_PASSWORD` | Passwort, mit dem auf `/host` Räume eröffnet werden. Fehlt es, erzeugt der Server bei jedem Start ein zufälliges und schreibt es ins Log. | zufällig |
| `MODEL_RUN` | Modell, das die Prompts der Teilnehmer ausführt | `claude-haiku-5-5` |
| `MODEL_JUDGE` | Modell des Schiedsrichters | `claude-sonnet-5-5` |
| `PORT` | Port des Servers (Render setzt ihn selbst) | `3000` |
| `DATA_DIR` | Ordner für den gespeicherten Spielstand | `./data` |

Die Modellnamen stammen aus der Anthropic-Modellübersicht vom Oktober 2026. Werden Modelle später abgelöst, genügt es, die beiden Variablen zu ändern.

**Kosten:** Pro Runde mit 12 Teilnehmern fallen 12 Ausführungen, 6 Urteile und eine Wahl des besten Prompts an. Nach den Listenpreisen vom Oktober 2026 ist das grob geschätzt ein niedriger zweistelliger Cent-Betrag pro Runde, also etwa 1 bis 2 US-Dollar für ein Training mit 6 Runden. Die tatsächlichen Kosten hängen von der Länge der Prompts und Antworten ab.

## Cases anpassen

Sechs Cases sind voreingestellt (`lib/cases.js`). In der Lobby und zwischen den Runden kannst du sie über "Cases bearbeiten" ändern, umsortieren, löschen oder neue anlegen. Jeder Case hat:

- **Titel** und **Aufgabe** (sehen alle),
- optional **Material**, das jedem Prompt automatisch angehängt wird (sehen alle),
- **Bewertungshinweise**, die nur der Schiedsrichter sieht. Je konkreter sie beschreiben, woran ein gutes Ergebnis zu erkennen ist, desto treffender wird das Urteil.

Änderungen gelten für den jeweiligen Raum. Wer die Voreinstellung dauerhaft ändern will, bearbeitet `lib/cases.js`.

## Datenschutz und Sicherheit

- Die Prompts der Teilnehmer werden zur Ausführung und Bewertung an die Anthropic API geschickt und sind für die Moderation sichtbar. Der beste Prompt jeder Runde wird allen gezeigt. Die Teilnehmer werden beim Beitritt darauf hingewiesen, keine vertraulichen oder personenbezogenen Daten einzugeben. Bei Kundentrainings bitte vorab klären, ob das zu den Vorgaben des Kunden passt.
- Der Server speichert nur den Spielstand (Namen der Figuren, Prompts, Antworten, Urteile) in `DATA_DIR/state.json`. Räume werden nach 36 Stunden gelöscht.
- Räume eröffnen kann nur, wer das Moderator-Passwort kennt. Der API-Schlüssel bleibt auf dem Server und erreicht nie einen Browser.
- Der Raumcode ist kein Geheimnis: Wer ihn kennt, kann beitreten und die Beameransicht sehen. Unerwünschte Gäste entfernst du unter "Teilnehmer verwalten".

## Selbsttest

```bash
node test/simulate.js                 # komplettes Spiel, 12 Teilnehmer, 6 Runden, Demo-Modus
node test/simulate.js --players 11    # ungerade Teilnehmerzahl mit Hausgegner
node test/simulate.js --mock-api      # prüft den API-Pfad gegen einen lokalen Testserver
```

Der Test prüft unter anderem: Passwortschutz, Auslosung ohne Wiederholungen, dass niemand Ergebnisse oder fremde Prompts vor dem Aufdecken sieht, die Punktesumme und den Export. Der Aufruf der echten Anthropic API ist darin nicht enthalten. **Spiele deshalb vor dem ersten Training eine Proberunde mit echtem Schlüssel**, am besten mit zwei oder drei Browserfenstern.

## Aufbau

```
server.js          Webserver, Schnittstellen, Live-Updates
lib/game.js        Spiellogik: Räume, Runden, Auslosung, Punkte, wer was sehen darf
lib/judge.js       Schiedsrichter: Ausführen, Urteil, bester Prompt, Demo-Modus
lib/cases.js       Voreingestellte Cases
public/            Teilnehmerseite, Moderation, Beameransicht, Figuren
test/simulate.js   Selbsttest
render.yaml        Blueprint für Render
Dockerfile         für den Betrieb als Container
```
