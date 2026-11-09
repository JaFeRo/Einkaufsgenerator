# Feature: Demo-Modus („Kasse“) für Präsentationen

> Auftrag an Claude Code. Lies vorher `docs/PLAN.md` und `README.md`.
> Ziel: ein zusätzlicher Reiter, in dem es so aussieht, als bediene ein Händler (künftiger Nutzer des dAKZ-Verfahrens) seine Kasse. Er tippt einen Einkauf ein, rechts entsteht groß der Kassenbon mit QR-Code, der Kunde scannt ihn mit der eZOLL-App.
> Die Werkbank („Bons erzeugen“), die Rückprüfung und die Spezifikation bleiben unverändert.

## 1. Zielbild

- Ein neuer Reiter **„Demo“** (Hash `#demo`) neben „Bons erzeugen“, „Rückprüfung“ und „Spezifikation“.
- Die Oberfläche ist abgespeckt. Sie wirkt wie eine einfache Kassenoberfläche, nicht wie ein Testwerkzeug.
- Es gibt nur zwei Bereiche:
  - **Links (ca. 40 %): Kasse.** Artikelauswahl, Warenkorb, Abschluss.
  - **Rechts (ca. 60 %): Kassenbon.** Groß, prominent und live mitwachsend.
- Alles Technische ist ausgeblendet: Fehlerinjektion, ECC, TSE-Modus, Bytegrenze, Steuersatz-Format, LF-Optionen, Prüfer/Inspector, CSV-Ansicht, Bon-Nr.-Feld, gespeicherte Bons, Export.

## 2. Testhändler

Mehrere fiktive Händler, jeweils mit **eigenem Sortiment** und eigenem Bonkopf. Die Auswahl erfolgt oben in der Demo-Ansicht, z. B. als Dropdown oder Kacheln „Händler wählen“. Ein Wechsel leert den Warenkorb.

Je Händler: Name, Anschrift, USt-IdNr. (fiktiv, `DE0000000NN`), Kasse/Filiale, ein Slogan- oder Fußzeilentext für den Bon, eine Akzentfarbe bzw. ein Initialen-Badge für die Kassenoberfläche und das Sortiment.

Vorschlag (alle Namen, Straßen und Nummern frei erfunden, keine echten Marken):

| ID | Händler | Ort | Sortiment (Beispiele) |
|---|---|---|---|
| `kaufhaus` | Kaufhaus Rheinbrücke (bestehender `MERCHANT`) | Konstanz | gemischt, wie heutiger `CATALOG` |
| `mode` | Modehaus Seeblick | Lindau | Wollmantel, Kaschmirschal, Lederstiefel, Jeans, Seidenbluse |
| `elektro` | Elektro Grenzland | Lörrach | Kopfhörer, Tablet, Kamera, Smartwatch, Ladekabel |
| `parfuem` | Parfümerie Lindenhof | Freiburg im Breisgau | Eau de Parfum, Pflegeset, Lippenstift, Rasierer |
| `uhren` | Uhren & Schmuck am Rheinufer | Weil am Rhein | Automatikuhr, Goldkette, Ohrstecker, Uhrenarmband |
| `feinkost` | Feinkost Alpenblick | Garmisch-Partenkirchen | Bergkäse (kg), Schinken (kg), Honig, Wein, Bier |
| `sport` | Sporthaus Hochfirst | Titisee-Neustadt | Wanderschuhe, Skijacke, Rucksack, Stöcke |

Regeln für das Sortiment:
- 12–20 Artikel je Händler, realistische Preise.
- Steuersätze passend gemischt: Lebensmittel und Bücher 7 %, sonst 19 %.
- Feinkost hat mindestens 2 Artikel nach **kg** (Wiegeware).
- Mindestens ein Händler hat einen **nicht erstattungsfähigen** Artikel (P3 = 0), z. B. Geschenkgutschein, Pfand oder Änderungsservice. Er soll in der Demo zeigen, dass das Feld existiert.
- Artikeltexte müssen in **ISO 8859-1** kodierbar sein (Fassung 1.3): Umlaute und ß sind erlaubt, kein €-Zeichen, keine Emojis, keine typografischen Anführungszeichen oder Gedankenstriche.
- Je Artikel eine Kategorie, damit die Kasse filtern kann (z. B. „Bekleidung“, „Schuhe“, „Accessoires“).

Ablage: neues Modul `src/dakz/merchants.ts` (UI-frei) mit `DEMO_MERCHANTS`. `MERCHANT` und `CATALOG` bleiben für Werkbank und Tests unverändert. Der Typ `Merchant` bleibt kompatibel; Zusatzfelder (Slogan, Farbe, Sortiment) kommen in einen eigenen Typ `DemoMerchant`.

## 3. Kasse (links)

- **Artikelkacheln** in einem Raster: Name und Preis groß, touchtauglich (mindestens 44 px), Kategorie-Filter als Chips, dazu ein Suchfeld.
- **Antippen** fügt 1 Stück hinzu. Nochmaliges Antippen erhöht die Menge.
- **kg-Artikel** öffnen ein kleines Eingabefeld „Gewicht in kg“ (z. B. 0,452) statt direkt hinzuzufügen.
- **Warenkorb** unter dem Raster: Zeilen mit Menge −/+ und Entfernen, Zwischensumme.
- **Freie Position** (optional, eingeklappt): Text, Preis, Steuersatz 7/19 %. Damit kann man in der Präsentation spontan Wünsche aus dem Publikum eingeben.
- **Mindestumsatz:** Liegt die Summe bei höchstens 50,00 €, erscheint ein dezenter Hinweis „Noch X € bis zum Mindestumsatz für den Ausfuhrkassenzettel“, und „Bon abschließen“ ist gesperrt. Das ist zugleich ein schöner Erklärpunkt für das Publikum.
- **Schnellstart:** Je Händler 1–2 vorbereitete **Beispielkörbe** („Beispieleinkauf laden“), damit der Vortragende nicht live acht Artikel klicken muss.

## 4. Ablauf

1. Händler wählen, dann Artikel erfassen. Der Bon rechts wächst live mit, noch **ohne QR-Code** (Platzhalter „QR-Code erscheint nach Abschluss“).
2. **„Bon abschließen“**: BON_NR vom gemeinsamen Zähler ziehen (`useBonCounter`, damit die Nummern eindeutig bleiben, denn die Duplikatsprüfung im Backend läuft über BON_NR), BON_START/BON_ENDE setzen (Start = erster Artikel, Ende = Abschluss), TSE-Daten erzeugen, QR-Code(s) anzeigen.
3. Nach dem Abschluss ist der Bon gesperrt. Buttons: **„QR groß anzeigen“** (bestehendes `ScanOverlay` wiederverwenden, Pfeiltasten für Teilcodes) und **„Nächster Kunde“** (leert den Warenkorb, gleicher Händler).
4. Überlauf: Bei großen Einkäufen teilt die bestehende Logik auf mehrere Codes auf („QR 1/2“). Das soll ohne Eingriff funktionieren.

## 5. Kassenbon (rechts)

- Die bestehende Komponente `Receipt` wiederverwenden und um eine Option für die Demo erweitern (z. B. `variant="demo"`), statt eine neue Bonkomponente zu bauen.
- **Deutlich größer** darstellen: Skalierung ca. 1,4–1,6 bezogen auf die verfügbare Höhe/Breite, gut lesbar auf Beamer. Die QR-Größenlogik (Modulgröße wie gedruckt) darf in der Demo durch die Skalierung überstimmt werden. Der Code muss vom Bildschirm scanbar bleiben.
- Bonkopf aus dem gewählten Händler: Name, Anschrift, USt-IdNr., Slogan; Fuß mit händlereigenem Text, z. B. „Vielen Dank für Ihren Einkauf!“ und Öffnungszeiten.
- Die technische Zeile unter dem QR-Code (Version, Byte, mm, Punkte) entfällt in der Demo. Es bleibt nur „QR 1/2“ bei mehreren Codes.
- Der Aufdruck **„TESTBELEG“** und „Simulation · kein steuerlich gültiger Beleg“ bleiben **zwingend**.
- Bei langen Bons scrollt der Bon mit, damit die neueste Position bzw. nach Abschluss der QR-Code sichtbar ist.
- Kleine Animation beim Hinzufügen einer Zeile (dezent, abschaltbar per `prefers-reduced-motion`).

## 6. Feste Einstellungen in der Demo

- Spezifikation: die im Kopf gewählte Fassung (Standard 1.3). Der Umschalter im Kopf bleibt sichtbar. *(Siehe offene Frage 1.)*
- ECC Q, keine Fehlerinjektion, Standardgrenze 1.663 Byte, Zahlart „Karte“.
- TSE: zufällige Daten (wie heute `random`).
- Validierung läuft im Hintergrund weiter. Ist ein Bon nicht konform (darf eigentlich nicht passieren), erscheint ein unaufdringlicher Hinweis mit dem Befund statt eines stillen Fehlers.

## 7. Zustand und Navigation

- Die Demo hat einen **eigenen Zustand** (Händler, Warenkorb, abgeschlossener Bon). Sie überschreibt nicht den aktuellen Bon der Werkbank. Persistenz in `localStorage` unter eigenem Schlüssel, damit ein Neuladen während der Präsentation nichts verliert.
- Deep-Link: `#demo` öffnet die Demo, `#demo/<haendler-id>` wählt direkt den Händler.
- **Präsentationsansicht:** Ein Button „Vollbild“ blendet App-Kopf und Reiter aus (Fullscreen-API). Esc beendet sie.
- Optional: ein Button „In Werkbank öffnen“ übernimmt den Demo-Bon in „Bons erzeugen“, falls man in der Präsentation technisch nachschauen will.

## 8. Tastatur

Leertaste = nächster Kunde, Enter = Bon abschließen, S = QR groß anzeigen, Esc = Overlay bzw. Vollbild schließen. Die Tasten dürfen nicht in Eingabefeldern greifen.

## 9. Responsiv

- Ab ca. 1024 px Breite: zwei Spalten wie oben.
- Darunter (Tablet hochkant, Smartphone): Kasse oben, Bon darunter, und ein fixierter Balken unten mit Summe und „Bon abschließen“.
- 390 px ohne horizontalen Überlauf (wie bestehende Prüfung).

## 10. Tests und Abnahme

- Unit-Tests (Vitest), neue Datei `tests/demo.test.ts`:
  - Jeder Artikel jedes Händlers ist in ISO 8859-1 kodierbar und besteht die Feldprüfung (P2–P7) in **beiden** Fassungen.
  - Jeder Beispielkorb liegt über 50,00 € und erzeugt einen Bon ohne Fehler im Validator (1.2 und 1.3).
  - Ein großer Korb (z. B. 120 Positionen) teilt sich korrekt auf mehrere Codes auf, und der QR-Rundlauf stimmt (wie `roundtrip.test.ts`).
  - BON_NR ist nach mehreren „Nächster Kunde“ fortlaufend und eindeutig.
- Bestehende Tests bleiben grün, Werkbank und Rückprüfung verhalten sich unverändert.
- Manuell (Playwright/Chromium): Demo-Bon abschließen, Screenshot des QR-Codes in der Rückprüfung hochladen, Ergebnis „Vollständig & konform“. Ansicht bei 1920×1080 (Beamer) und 390 px prüfen.
- README (Abschnitt Funktionen) und `docs/PLAN.md` (Abschnitt Stand, neue Phase „9 – Demo-Modus“) ergänzen.

## 11. Nicht im Umfang

Echte Kartenzahlung, Kundendisplay auf zweitem Bildschirm, Drucken aus der Demo, Bearbeiten der Händler in der Oberfläche (Händler sind im Code gepflegt).

## 12. Offene Fragen (vor dem Bau klären, sonst Standard nehmen)

1. **Fassung in der Demo:** Folgt sie dem Umschalter im Kopf (Standard) oder ist sie fest auf 1.3?
2. **Publikum:** Fachbereich/Zoll oder Händler? Bei technischem Publikum ein Schalter „Technik einblenden“, der unter dem Bon das CSV des QR-Codes zeigt. Standard: nicht bauen.
3. **Händlerkopf frei editierbar** (Name eintippen, z. B. für eine Präsentation bei einem konkreten Partner)? Standard: nein, nur die vordefinierten.
4. **Gerät:** Laptop mit Beamer oder Tablet? Standard: beides wie in Abschnitt 9.
