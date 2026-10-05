# Einkaufsgenerator – dAKZ Bonsimulator

Erzeugt Test-Kassenbons mit QR-Codes nach der „Schnittstellendefinition QR-Code“ der Generalzolldirektion (digitaler Ausfuhrkassenzettel, dAKZ, Version 1.2) und prüft eingescannte Codes gegen die Spezifikation.

Alle erzeugten Belege sind Testdaten mit fiktiven Händlerangaben, tragen den Aufdruck „TESTBELEG“ und sind keine steuerlich gültigen Belege.

## Funktionen

**Bons erzeugen**
- Szenarien: Zufallseinkauf, Zoll-Beispiel 6.1, 5 Steuersätze, Wiegeware, Rabatt & Pfand, Grenze 50,01 €, Sonderzeichen, Überlauf
- Positionen und Kopfdaten frei bearbeitbar, Prüfung live
- **Eigene Bons** als Testfälle speichern, laden, aktualisieren, löschen sowie als JSON exportieren und importieren (im Browser gespeichert)
- **Eindeutige BON_NR**: fortlaufender Zähler, jeder neue Bon bekommt die nächste freie Nummer; „Gleicher Einkauf, neue Nr.“ für wiederholte Scans; Warnung bei schon verwendeten Nummern; Startwert frei setzbar
- QR-Codes im Byte-Modus (UTF-8) mit Fehlerkorrektur Q; automatische Aufteilung ab 1.663 Byte oder einer selbst gewählten Grenze
- TSE-Daten zufällig oder als echte ECDSA-Signatur (P-384)
- Fehler einbauen für Negativtests (Summen, Zeilen, CRLF, Steuersatz-Format, ECC M)
- Scanmodus: Code bildschirmfüllend, Pfeiltasten für Teilcodes, Leertaste für den nächsten Bon, N für gleichen Einkauf mit neuer Bon-Nr.
- Druck für 58- oder 80-mm-Papier mit Angabe der Modulgröße, Export als PNG und TXT, Serie als ZIP, Bon als Link teilen

**Rückprüfung**
- Codes per Kamera, Foto/Screenshot (auch Drag & Drop und Strg+V) oder als Text einlesen
- Codes eines Bons werden zusammengeführt (1/3, 2/3 …) und gemeinsam geprüft
- Feldprüfung mit den regulären Ausdrücken der Spezifikation, Summenkontrolle, Hinweis bei anderer Fehlerkorrektur als Q
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
docs/        Plan, Auswertung der Spezifikation, Rückfragen an den Autor (auch in der App unter „Spezifikation“)
```

## Veröffentlichung

`.github/workflows/pages.yml` baut bei jedem Push auf `main` und veröffentlicht `dist/` auf GitHub Pages. Einmalig in den Repository-Einstellungen unter *Settings → Pages → Source* „GitHub Actions“ wählen.

Details zur Spezifikation und zu ihren Unstimmigkeiten: [`docs/PLAN.md`](docs/PLAN.md).
