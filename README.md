# Einkaufsgenerator – dAKZ Bonsimulator

Erzeugt Test-Kassenbons mit QR-Codes nach der „Schnittstellendefinition QR-Code“ der Generalzolldirektion (digitaler Ausfuhrkassenzettel, dAKZ, Versionen 1.2 und 1.3, oben rechts umschaltbar) und prüft eingescannte Codes gegen die Spezifikation.

Alle erzeugten Belege sind Testdaten mit fiktiven Händlerangaben, tragen den Aufdruck „TESTBELEG“ und sind keine steuerlich gültigen Belege.

## Funktionen

**Bons erzeugen**
- Szenarien: Zufallseinkauf, Zoll-Beispiel 6.1, 5 Steuersätze, Wiegeware, Rabatt & Pfand, Grenze 50,01 €, Sonderzeichen, Überlauf
- Positionen und Kopfdaten frei bearbeitbar, Prüfung live
- **Eigene Bons** als Testfälle speichern, laden, aktualisieren, löschen sowie als JSON exportieren und importieren (im Browser gespeichert)
- **Eindeutige BON_NR**: fortlaufender Zähler, jeder neue Bon bekommt die nächste freie Nummer; „Gleicher Einkauf, neue Nr.“ für wiederholte Scans; Warnung bei schon verwendeten Nummern; Startwert frei setzbar
- QR-Codes im Byte-Modus (1.2: UTF-8 mit TSE-Feldern, 1.3: ISO 8859-1 ohne TSE, optional K8) mit Fehlerkorrektur Q; automatische Aufteilung ab 1.663 Byte oder einer selbst gewählten Grenze
- TSE-Daten zufällig oder als echte ECDSA-Signatur (P-384)
- Fehler einbauen für Negativtests (Summen, Zeilen, CRLF, Steuersatz-Format, ECC M)
- Scanmodus: Code groß auf dem Bildschirm (kleinere Codes proportional kleiner), Pfeiltasten für Teilcodes, Leertaste für den nächsten Bon, N für gleichen Einkauf mit neuer Bon-Nr.
- QR-Größe wie auf dem echten Bon: feste Modulgröße (3, 4 oder 6 Druckpunkte bei 203 dpi), der Code wird mit dem Inhalt größer und füllt erst ab einer bestimmten Menge die Druckbreite (72 mm bei 80-mm-, 48 mm bei 58-mm-Papier); gilt für Bildschirm und Druck
- Druck für 58- oder 80-mm-Papier, Export als PNG und TXT, Serie als ZIP, Bon als Link teilen

**Rückprüfung**
- Codes per Kamera, Foto/Screenshot (auch Drag & Drop und Strg+V) oder als Text einlesen
- Codes eines Bons werden zusammengeführt (1/3, 2/3 …) und gemeinsam geprüft
- Feldprüfung mit den regulären Ausdrücken der jeweiligen Fassung (in der Rückprüfung automatisch erkannt, auch die Zeichenkodierung), Summenkontrolle, Hinweis bei anderer Fehlerkorrektur als Q
- Fehler, wenn verschiedene gescannte Bons dieselbe BON_NR tragen

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Unit- und Rundlauftests (Vitest, zxing-wasm)
npm run build      # Produktionsbuild nach dist/
```

Die Kamera braucht HTTPS oder `localhost`.

**Bon-Nummern und gespeicherte Bons** liegen im `localStorage` des Browsers. Der Zähler gilt je Browser (auch über mehrere Tabs hinweg). Testen mehrere Personen gegen dasselbe Unternehmen, sollte jede einen eigenen Startwert setzen, z. B. 1000000, 2000000 …

## Aufbau

```
src/dakz/    Kern ohne UI: Datenmodell, Generator, Validator, Szenarien
src/qr/      QR-Kodierung (qrcode-generator, Byte-Modus, ECC Q)
src/scan/    QR-Erkennung (zxing-wasm, WASM wird mitgeliefert)
src/ui/      React-Oberfläche
tests/       Golden-Tests gegen die Zoll-Beispiele, Regex-Grenzwerte, QR-Rundlauf
docs/        Plan, Auswertung der Spezifikation, Rückfragen an den Autor (nur als Dokument)
```

## Veröffentlichung

`.github/workflows/pages.yml` baut bei jedem Push auf `main` oder den Testbranch beide Stände: `main` an der Wurzel der Site, den Testbranch mit `VITE_CHANNEL=test` (Hinweis „Testversion“) unter `/test/`. Damit der Testbranch veröffentlichen darf, muss er unter *Settings → Environments → github-pages* als Deployment-Branch erlaubt sein. Einmalig in den Repository-Einstellungen unter *Settings → Pages → Source* „GitHub Actions“ wählen.

Details zur Spezifikation und zu ihren Unstimmigkeiten: [`docs/PLAN.md`](docs/PLAN.md).
