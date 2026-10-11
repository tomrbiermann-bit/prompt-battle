// Die Kreaturen des Prompt Battles. Diese Liste ist die einzige Stelle, an der Kreaturen gepflegt werden.
//
// Neue Kreatur hinzufügen:
//   1. Zeichnung als SVG nach public/img/<id>.svg legen (quadratisch, am besten 360 x 360).
//   2. Unten eine Zeile ergänzen. Mehr ist nicht nötig, die Auswahl der Teilnehmer wächst automatisch mit.
//
// id:     Dateiname ohne .svg, nur Kleinbuchstaben
// label:  Name der Kreatur, erscheint hinter dem Namen des Teilnehmers ("Tom - Halluzino")
// hint:   kurzer Satz in der Auswahl
// thema:  Bezug zum Training (Baustein oder Technik)
// faces:  Blickrichtung der Zeichnung, 'r' = nach rechts, 'l' = nach links (für die Kampfszene)

const FIGURES = [
  { id: 'rollux', label: 'Rollux', hint: 'schlüpft in jede Rolle', thema: 'Baustein Rolle', faces: 'r' },
  { id: 'promptling', label: 'Promptling', hint: 'bringt die Aufgabe auf den Punkt', thema: 'Baustein Aufgabe', faces: 'r' },
  { id: 'kontextor', label: 'Kontextor', hint: 'hat immer Kontext dabei', thema: 'Baustein Kontext', faces: 'r' },
  { id: 'schranko', label: 'Schranko', hint: 'weiß, was rein muss und was nicht', thema: 'Baustein Anforderungen', faces: 'r' },
  { id: 'formatix', label: 'Formatix', hint: 'liebt Struktur', thema: 'Baustein Ausgabeformat', faces: 'r' },
  { id: 'kriterio', label: 'Kriterio', hint: 'prüft mit klarem Maßstab', thema: 'Baustein Qualitätskriterien', faces: 'r' },
  { id: 'exempla', label: 'Exempla', hint: 'lernt aus Beispielen', thema: 'Technik Few-Shot', faces: 'r' },
  { id: 'nachfrago', label: 'Nachfrago', hint: 'fragt lieber einmal nach', thema: 'Technik Rückfragen', faces: 'l' },
  { id: 'loopi', label: 'Loopi', hint: 'verbessert in Schleifen', thema: 'Technik Kritik und Verbesserung', faces: 'r' },
  { id: 'coacho', label: 'Coacho', hint: 'feilt an jedem Prompt', thema: 'Technik Prompt-Coach', faces: 'r' },
  { id: 'stufo', label: 'Stufo', hint: 'geht Schritt für Schritt', thema: 'Technik Chain of Thought', faces: 'r' },
  { id: 'halluzino', label: 'Halluzino', hint: 'erfindet gern Dinge', thema: 'Risiko Halluzination', faces: 'l' }
];

// Ideen für weitere Kreaturen (noch nicht gezeichnet):
//   Tokeno      zählt alles in Häppchen                (Tokens)
//   Plausibla   klingt immer überzeugend               (Plausibilität ist nicht Wahrheit)
//   Faktocheck  glaubt nur, was belegt ist             (Qualitätscheck Inhalt)
//   Datenschutzi hält Vertrauliches unter Verschluss   (sichere Nutzung)
//   Kopilot     fliegt mit, steuert aber nicht         (Mensch entscheidet)
//   Vagus       bleibt gern im Ungefähren              (unklare Prompts)
//   Schablono   hat für alles eine Vorlage             (wiederverwendbare Prompts)
//   Iterato     gibt sich nie mit Fassung eins zufrieden

const FIGURE_IDS = FIGURES.map((f) => f.id);
const byId = Object.fromEntries(FIGURES.map((f) => [f.id, f]));
const labelOf = (id) => (byId[id] ? byId[id].label : '');
const displayName = (name, figure) => (labelOf(figure) ? name + ' - ' + labelOf(figure) : name);

module.exports = { FIGURES, FIGURE_IDS, labelOf, displayName };
