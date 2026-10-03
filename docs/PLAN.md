# dAKZ Bonsimulator – Design & Plan

Ein Simulator, der realistische Kassenbons mit QR-Codes für den **digitalen Ausfuhrkassenzettel (dAKZ)** erzeugt. Damit lässt sich das Einscannen mit der eZOLL-App (Dienst „Ausfuhrkassenzettel“) oder mit eigenen Scannern testen, ohne ein echtes Kassensystem.

Grundlage: **„Schnittstellendefinition QR-Code – Technische Beschreibung des Datenformats“**, Generalzolldirektion, Version 1.2 vom 01.09.2026.
Quelle: [zoll.de – Anbindung an dAKZ über die eZOLL-App](https://www.zoll.de/DE/Fachthemen/Steuern/Umsatzsteuererstattung/anbindung_dakz_ezoll.html) → „Anforderungen an den QR-Code“ (PDF).

Die App liegt unter `src/` (siehe README). Der anfängliche HTML-Prototyp ist darin aufgegangen.

---

## 1. Spezifikation in Kürze

| Zeile | Häufigkeit | Felder |
|---|---|---|
| `K` Kopf | genau 1 | K2 Nummer · K3 Gesamtanzahl · K4 BON_NR · K5 BON_START · K6 BON_ENDE (Unix-Sekunden UTC) · K7 UMS_BRUTTO (> 50,00) |
| `E` Erweitert | genau 1, nur Primärcode | E2 UMS_NETTO · E3 MWST · E4 TSE_TA_SIG · E5 TSE_PUBLIC_KEY (Base64) · E6 externeKundenReferenz (optional) |
| `M` MwSt | 1–5, nur Primärcode | M2 MWST_SATZ · M3 UMS_BRUTTO · M4 UMS_NETTO · M5 MWST |
| `P` Position | 1–1000 | P2 MWST_SATZ · P3 ERSTATTUNGSFAEHIG (0/1, Standard 1) · P4 UMS_BRUTTO · P5 MENGE · P6 EINHEIT (Standard „Stück“) · P7 ARTIKELTEXT |

- CSV nach RFC 4180, Trennzeichen `;`, Zeilenende LF, UTF-8, keine Überschriftenzeile, Dezimalkomma.
- Felder mit `;` oder `"` werden in `"` eingeschlossen, `"` wird als `""` maskiert.
- Nur Geschäftsvorfälle vom Typ „Umsatz“.
- QR nach ISO/IEC 18004, kleinstmögliche Version (max. 40), ECC Q.
- **Überlauf:** Zeilen werden nie getrennt. Folgecodes enthalten nur `K` (mit K2 = laufende Nummer, K3 = Gesamtzahl) und `P`-Zeilen.
- Händlername/-adresse sind **nicht** Teil des Codes; die App ordnet den Einkauf über die Anmeldung des Unternehmens zu.

## 2. Auffälligkeiten in der Spezifikation

Die Beispiel-QR-Codes aus dem PDF wurden dekodiert und mit dem Text verglichen:

1. **Kapazität widersprüchlich.** 2.420 Zeichen ist die Grenze des *alphanumerischen* QR-Modus bei Version 40/ECC Q. Der Inhalt enthält Kleinbuchstaben, `;` und Umlaute und benötigt daher den **Byte-Modus**, der bei Version 40/ECC Q nur **1.663 Byte** fasst. Bei wörtlicher Umsetzung (2.420 Zeichen, ECC Q) ist kein Code erzeugbar.
2. **ECC-Level der Beispiele.** 6.1 und 6.2 sind mit ECC **L** kodiert, der Primärcode in 6.3 mit ECC **M** und 2.325 Byte – nicht mit Q.
3. **Abschließendes LF.** Laut EBNF endet jeder record mit LF. 6.1 und 6.3 haben am Ende keins, 6.2 schon.
4. **Summen in den Beispielen.** 6.2: E2/E3 = 44,72/10,49, Summe der M-Zeilen ergibt 45,70/9,51. 6.3: K7 = 60,88, Summe M3 = 60,85. Konsistenzregeln sind nicht spezifiziert.
5. **Regex-Details.** P2/M2 enthalten im PDF ein Leerzeichen (`^\d{1,2} (,\d{1,2})?$`), das kein Beispiel erfüllt. K4 nennt „bis zu 13 Ziffern“, die Regex erlaubt höchstens 10¹². Das Feldbeispiel zeigt „19,00“, alle Beispieldatensätze „19“. Die P4-Regex lässt 50.000,01–50.000,99 zu, der Text nennt ±50.000.

Der Simulator macht diese Punkte einstellbar (Profil, ECC, Grenze, Steuersatz-Format, LF) und meldet Summenabweichungen als Warnung statt als Fehler.

**Verifiziert:** Der Generator reproduziert Beispiel 6.1 byte-genau (mit „ohne abschließendes LF“). Erzeugte Überlauf-Codes wurden aus einem Browser-Screenshot mit zxing dekodiert und stimmen mit dem CSV überein.

## 3. Design

**Leitidee: die Werkbank.** Drei Zonen, auf schmalen Bildschirmen untereinander:

| Links: Einkauf | Mitte: Bon | Rechts: Prüfer |
|---|---|---|
| Szenario-Chips, Kopfdaten, editierbare Positionen, QR-Profil, Fehlerinjektion | Thermobon 80 mm, TSE-Block, QR-Code(s) mit „1/3“, Stempel „TESTBELEG“ | Status (gültig/Warnung/Fehler), Füllstand je Code, farbiges CSV, Befundliste, entschlüsselte Kopfzeile |

- **Szenarien:** Zoll-Beispiel 6.1, Zufallseinkauf, 5 Steuersätze (wie 6.2), Wiegeware (kg), Grenzfall 50,01 €, Überlauf (mehrere Codes). „Nächster Bon“ würfelt einen neuen Einkauf.
- **Scanmodus:** QR bildschirmfüllend auf Weiß, Pfeiltasten wechseln Teil-Codes – zum Scannen direkt vom Monitor.
- **Fehler einbauen:** K7 ≠ Summe, Ende vor Start, E-Zeile fehlt, CRLF statt LF, keine Positionen – für Negativtests.
- **Gestaltung:** kühles Grau-Grün als Tisch, Zollgrün als einziger Akzent, Papierweiß nur für den Bon. Archivo (schmal) für Überschriften, IBM Plex Sans/Mono für UI und Daten, Courier Prime für den Bon. Hell- und Dunkelmodus; der Bon bleibt weiß.
- Fiktive Händlerdaten und deutlicher Hinweis „Simulation · kein steuerlich gültiger Beleg“.

## 4. Technischer Plan

**Stack:** Vite + TypeScript + React, rein clientseitig, Hosting über GitHub Pages.

```
src/
  dakz/            # UI-freie Kernbibliothek
    types.ts       # Receipt, Position, Options
    money.ts       # Cent-Arithmetik, Formatierung mit Dezimalkomma
    generate.ts    # Zeilen bauen, CSV serialisieren, auf Codes aufteilen
    validate.ts    # Parser + Regex-Prüfung je Feld + Konsistenzwarnungen
    scenarios.ts   # Testdaten, Katalog, Seeds, TSE-Daten
  qr/              # QR-Rendering (Byte-Modus, feste ECC, Versionsangabe)
  ui/              # Werkbank: Editor, Receipt, Inspector, ScanMode
tests/
  fixtures/        # dekodierte Zoll-Beispiele 6.1, 6.2, 6.3
```

**Tests:**
- Golden-Tests gegen die Zoll-Beispiele (6.1 exakt, 6.2/6.3 durch den Validator).
- Grenzwerttests für jede Regex (z. B. K7 50,00 ✗ / 50,01 ✓, P4 ±50.000,00).
- Property-Tests: zufällige Bons → Validator fehlerfrei → QR dekodierbar → Inhalt identisch.
- Playwright: Bon rendern, Screenshot dekodieren (zxing-wasm), mit CSV vergleichen.

### Phasen

| Phase | Inhalt |
|---|---|
| 1 – Kern & Tests | Prototyp-Logik nach TypeScript portieren, Referenz- und Grenzwerttests |
| 2 – Werkbank-UI | Editor, Bon, Prüfer, Scanmodus als Komponenten; Zustand in der URL (Bon als Link teilen) |
| 3 – Ausgabe | Druckansicht 58/80 mm (`@media print`), Export PNG/PDF/CSV, Serienerzeugung als ZIP |
| 4 – Rückprüfung | Code per Kamera oder Bild-Upload einlesen und gegen die Spezifikation prüfen (für fremde Kassensysteme) |
| 5 – Feinschliff | Echte ECDSA-Signaturen über WebCrypto, Verlauf, Deployment per GitHub Actions |

## 5. Entscheidungen

| Frage | Entscheidung |
|---|---|
| Profil | Fehlerkorrektur **Q**, Byte-Modus, max. 1.663 Byte je Code (Grenze kleiner einstellbar). ECC M nur als Fehlerinjektion. |
| Ausgabe | Vorrangig Bildschirm (Scanmodus), Druck für 58/80 mm möglich. |
| Framework | React + Vite + TypeScript, GitHub Pages. |
| Rückprüfung | Ja: Kamera, Bild, Text. |

## 6. Stand

| Phase | Stand |
|---|---|
| 1 – Kern & Tests | erledigt: `src/dakz`, 38 Tests (Golden 6.1, Regex-Grenzwerte, Fehlerinjektion, QR-Rundlauf mit zxing-wasm) |
| 2 – Werkbank-UI | erledigt: Editor, Bon, Prüfer, Scanmodus, Teilen per Link |
| 3 – Ausgabe | erledigt: Druck 58/80 mm mit Modulgrößen-Hinweis, PNG, TXT, Serie als ZIP |
| 4 – Rückprüfung | erledigt: Kamera, Upload/Einfügen, Text; Zusammenführung mehrteiliger Bons |
| 5 – Feinschliff | ECDSA-Signatur und Pages-Workflow erledigt; offen: Playwright-Tests im CI |
| 6 – Eigene Bons & BON_NR | erledigt: Bons speichern/laden/exportieren/importieren; fortlaufender, eindeutiger BON_NR-Zähler (Duplikatsprüfung im Backend läuft über BON_NR); Doppel-Erkennung in der Rückprüfung |

Manuell geprüft (Chromium, Playwright): Überlauf-Bon mit 3 Codes im Scanmodus fotografiert und in der Rückprüfung hochgeladen → „Vollständig & konform“; Druck-PDF (80 mm) mit 300 dpi gerastert → alle Codes lesbar; Serien-ZIP; Link-Rundlauf; 390 px ohne horizontalen Überlauf.
