**Betreff: Rückfragen und Änderungsvorschläge zur „Schnittstellendefinition QR-Code“ (dAKZ), Version 1.2 vom 01.09.2026**

Guten Tag,

ich habe auf Basis der Schnittstellendefinition einen Simulator gebaut, der Testbons mit QR-Codes erzeugt und eingescannte Codes gegen die Spezifikation prüft. Ich habe die Beispiel-QR-Codes aus Kapitel 6 aus dem PDF dekodiert und mit dem Text verglichen. Mir sind Unklarheiten und Widersprüche aufgefallen, die Kassenhersteller beim Umsetzen vermutlich ebenfalls treffen. Ich habe sie unten gesammelt, zuerst als Fragen, dann als Auffälligkeiten im Dokument und zum Schluss als Vorschläge, was ich ändern oder ergänzen würde.

Für die Beispielcodes gilt: 6.1 und 6.2 sind mit Fehlerkorrektur L kodiert, 6.3 (beide Codes) mit M. Keiner enthält ein ECI-Segment (Symbologiekennung `]Q1`).

---

## 1. Fragen

### QR-Kodierung

1. **Kapazität und Modus (Kap. 3.1, V3/V4).** Die Spezifikation nennt „Alphanumerisch, UTF-8“ und „max. Anzahl 2420 Zeichen“. 2.420 ist die Kapazität von Version 40 bei Fehlerkorrektur Q im *alphanumerischen* Modus. Dieser Modus kennt nur `0–9 A–Z` und `␣ $ % * + - . / :`, also weder Kleinbuchstaben noch Semikolon, Komma oder Umlaute. Der Inhalt braucht zwingend den Byte-Modus. Dort fasst Version 40 bei Q nur **1.663 Byte**. Welche Grenze gilt verbindlich: 1.663 Byte, oder soll die Fehlerkorrektur gesenkt werden (M: 2.331 Byte, L: 2.953 Byte)?
2. **Fehlerkorrektur.** Die Beispiele sind mit L bzw. M erzeugt, die Spezifikation verlangt Q. Akzeptiert die eZOLL-App jede Stufe, oder wird Q geprüft?
3. **Zeichenkodierung.** Der Inhalt soll UTF-8 sein, die Beispielcodes tragen aber kein ECI-Segment. Manche Scanner lesen Byte-Daten ohne ECI als ISO-8859-1 und machen aus „Stück“ ein „StÃ¼ck“. Soll UTF-8 mit ECI (26) angekündigt werden, oder bewusst nicht?
4. **Modulgröße (Kap. 2.2 Punkt 2).** Dort steht „Hinweise zur Modulgröße enthält Abschnitt 3.1“. In 3.1 steht dazu nichts. Gibt es eine Vorgabe zu Modulgröße, Ruhezone und Druckauflösung? Auf einem 58-mm-Bon (ca. 48 mm bedruckbar) ergibt Version 40 rechnerisch nur ca. 0,26 mm je Modul, das sind gut 2 Druckpunkte bei 203 dpi. Auf 80 mm (ca. 72 mm bedruckbar) sind es ca. 0,39 mm oder gut 3 Punkte. Beides ist am Rand dessen, was Handykameras zuverlässig lesen.

### Felder und Bedeutung

5. **Herkunft der BON_NR (K4).** Welche Nummer des Kassensystems ist gemeint? Auf dem Beispielbeleg (Abbildung 3) steht „302592“ als Artikelnummer in der Positionszeile, während der Beleg als TSE-Transaktionsnummer 103561 ausweist und daneben „1/1024“ steht. Im QR-Code ist 302592 die BON_NR. Ist das die Bonnummer der Kasse, die TSE-Transaktionsnummer oder ein anderer Zähler?
6. **Eindeutigkeit und Duplikatsprüfung (Kap. 2.1, Schritt 5).** Die Duplikatsprüfung läuft über „BON_NR, Unternehmen und Zeitstempel sowie – sofern belegt – über die TSE-Felder“. Ist die BON_NR je Unternehmen, je Filiale oder je Kasse eindeutig? Mehrere Kassen eines Unternehmens zählen oft getrennt und können dieselbe Nummer vergeben. Welcher Zeitstempel gehört zum Schlüssel (BON_START, BON_ENDE)? Was geschieht bei einem Treffer: Ablehnung oder stilles Verwerfen?
7. **Bedeutung von K7 und die 50-€-Grenze.** Enthält K7 den gesamten Bon oder nur erstattungsfähige Positionen? Bezieht sich die Grenze „größer 50,00“ auf den Bon, auf den erstattungsfähigen Anteil oder auf die Summe je Händler und Tag? Wie sind Bons zu behandeln, die durch Retouren oder Rabatte unter 50 € fallen?
8. **Rabatte, Pfand, Gutscheine (Kap. 4).** Es sollen nur Positionen vom Typ „Umsatz“ berücksichtigt werden. Im Beispielbeleg ist der Rabatt in den Positionspreis eingerechnet. Wie sind getrennte Rabattzeilen, Pfand, Pfandrückgabe, Gutscheine und Trinkgeld abzubilden? Dürfen negative Positionen (P4 erlaubt negative Werte) vorkommen?
9. **P4 und P5.** Ist P4 immer der Gesamtbetrag der Position (Menge × Einzelpreis)? Die Beispiele legen das nahe, der Text sagt es nicht. Was gilt bei fehlender MENGE (P5)? Bei P3 und P6 ist ein Standardwert genannt, bei P5 nicht (ich gehe von 1 aus).
10. **Steuersätze.** Es sind 1–5 M-Zeilen erlaubt, Beispiel 6.2 nennt selbst, dass nur zwei Sätze gültig sind. Prüft das Backend den Satz gegen eine Liste (z. B. 7 und 19)? Sind 0 % oder andere Sätze zulässig?
11. **TSE-Felder (E4, E5).** Beide sind als „mandatorisch“ markiert, Schritt 5 in Kap. 2.1 spricht aber von „sofern belegt“. Was ist mit Bons aus Kassen ohne TSE oder mit ausgefallener TSE? Wird die Signatur geprüft? Das wäre mit E4 und E5 allein nicht möglich, es fehlen Signaturzähler, TSE-Transaktionsnummer, Algorithmus und Zeitformat. Oder werden die Felder nur durchgereicht?

### Mehrere Codes

12. **Reihenfolge und Wiederholung.** Dürfen Folgecodes vor dem Primärcode gescannt werden? Was passiert bei zweimaligem Scan desselben Codes? Wie ordnet die App Folgecodes zu, die weder E-Zeile noch Referenz tragen? (Nach meiner Annahme über K4–K7. Bei zwei Bons mit gleichen Werten wäre das nicht eindeutig.)
13. **Primärcode im Extremfall.** Der Primärcode muss K, E, mindestens eine M-Zeile und mindestens eine P-Zeile enthalten. E4/E5 dürfen je 512 Zeichen haben, E6 255, ein Artikeltext 255 Zeichen. Rechnerisch passt das im Maximalfall nicht mehr in 1.663 Byte. Wie ist dieser Fall gedacht?

### Prüfung im Backend

14. **Konsistenzregeln.** Welche Summenprüfungen führt das Backend aus (K7 gegen Summe M3, E2 + E3 gegen K7, Summe P4 gegen K7, je Steuersatz)? Mit welcher Toleranz? Welche Rundungsregel gilt für M4 und M5 (je Steuersatz oder je Position)?
15. **Testen.** Gibt es eine Testumgebung oder offizielle Testdatensätze (gültige und gezielt ungültige)? Kap. 2.2 nennt als Weg einen Probeeinkauf mit eigener Registrierung als Privatperson. Für automatisierte Tests bei Kassenherstellern ist das aufwendig.
16. **Zusammenspiel mit anderen Belegcodes.** Ist abgestimmt, wie der dAKZ-Code neben einem QR-Code mit Belegdaten nach KassenSichV (in § 6 als Möglichkeit der Belegausgabe genannt) auf demselben Bon stehen soll? Woran erkennt die App, welcher von zwei Codes gemeint ist?

---

## 2. Auffälligkeiten im Dokument

### Beispiele (Kap. 6), nach Dekodieren der QR-Codes

| Beispiel | Befund |
|---|---|
| 6.1 | Kein abschließendes LF nach der letzten Zeile, obwohl die EBNF LF je Record verlangt. Fehlerkorrektur L. |
| 6.2 | **Netto und MwSt lassen sich nicht aus Satz und Brutto ableiten.** Beispiel 7 %: 3,50 € brutto ergibt 3,27 netto und 0,23 MwSt, im Beispiel stehen 3,25 und 0,25. Bei 8 % (5,50/0,44 gegen 5,46/0,48), 13 % (1,76/0,23 gegen 1,73/0,26), 19 % (28,55/5,43 gegen 27,52/6,46) und 21 % (8,10/1,70 gegen 7,74/2,06) weichen die Werte ebenfalls ab. E2 und E3 (44,72 / 10,49) stimmen zwar mit K7 überein (55,21), nicht aber mit der Summe der M-Zeilen (45,70 / 9,51). Der Text sagt, die Daten stammen aus verschiedenen Einkäufen. Gerade dann sollten sie in sich stimmig sein. Fehlerkorrektur L, LF am Ende vorhanden. |
| 6.3 | K7 = 60,88 und Summe aller P4 = 60,88 (21 Positionen über beide Codes), die Summe der M3 ist aber 60,85. Je Steuersatz passen die M-Zeilen nicht zu den Positionen: Die P-Zeilen mit 7 % summieren sich auf 3,08, die M-Zeile mit 7 % nennt 49,51. Die P-Zeilen mit 19 % ergeben 57,80, die M-Zeile mit 19 % 11,34. Beide Codes sind mit Fehlerkorrektur M kodiert, der Primärcode hat 2.325 Byte und passt damit nicht in Q. Kein abschließendes LF. |

### Reguläre Ausdrücke und Feldbeschreibungen

- **P2 und M2:** Der Ausdruck lautet im PDF `^\d{1,2} (,\d{1,2})?$`, also mit Leerzeichen vor der Gruppe. Das ist vermutlich ein Umbruchartefakt, passt aber so auf kein Beispiel („19“, „7,00“).
- **P2 und M2, Format:** Das Feldbeispiel zeigt „19,00“, alle Beispieldatensätze „19“. Beides erfüllt die Regex, die erwartete Form sollte benannt werden.
- **K4:** Der Text sagt „zwischen 1 und 13 Ziffern“. Die Regex `^[1-9]\d{0,11}$|^10{12}$` erlaubt 1–12 Ziffern sowie genau den Wert 1.000.000.000.000. Führende Nullen sind ausgeschlossen, viele Kassen vergeben aber Nummern mit Nullen oder Buchstaben.
- **P4:** Der Text sagt „zwischen −50.000 und 50.000“, die Regex lässt auch 50.000,01 bis 50.000,99 zu.
- **E3 (MWST):** „Wie E2“ erbt „größer 0“. Ein Bon, dessen Positionen alle mit 0 % besteuert sind, ist damit nicht darstellbar.
- **M3–M5:** `^-?([0-4]?\d{1,7}),\d{2}$` erlaubt führende Nullen, die an anderer Stelle ausgeschlossen sind.
- **K7:** Die Regex schließt 50,00 aus. Das entspricht „größer 50,00“, sollte aber im Text ausdrücklich so stehen.

### Redaktionelles

- Kap. 1.3 verweist für das Glossar auf „Tabelle 3“, das Glossar ist Tabelle 2.
- Kap. 1.3 verweist auf „Vorgabe C9“, die Tabelle der CSV-Vorgaben endet bei C8.
- Kap. 5 spricht von „den in Kapitel 2 getroffenen Entscheidungen“ zur Kapazität, diese stehen in Kap. 3.1. Der Verweis in 5.1 „Kapiteln 2 und 4“ auf die Kopfzeile meint vermutlich 4.1.
- Kap. 3.2 sagt, alle vier Zeilentypen seien mandatorisch. Folgecodes enthalten nur K und P (Kap. 5.1.1). Das sollte in 3.2 stehen.
- Kap. 1.4: „in der Regel [6] Monaten“ sieht nach einem übrig gebliebenen Platzhalter aus.
- Titelblatt: „Dokumentenablage: Intern“ bei einem öffentlich veröffentlichten Dokument.

---

## 3. Was ich anpassen oder ergänzen würde

1. **Kap. 3.1 korrigieren.** V3/V4 ersetzen durch: „Byte-Modus, ein Segment, Nutzlast UTF-8, Fehlerkorrektur Q. Maximale Nutzlast je QR-Code: 1.663 Byte (Version 40).“ Die Angabe „2420 Zeichen“ und „Alphanumerisch“ streichen. Falls höhere Kapazität nötig ist, ausdrücklich eine andere Stufe festlegen (M: 2.331 Byte) und die Beispiele daran ausrichten.
2. **ECI festlegen.** Entweder „mit ECI 26 (UTF-8)“ oder „ohne ECI, Leser müssen UTF-8 annehmen“, in beiden Fällen mit einem Beispielcode, der das zeigt.
3. **Praktische Obergrenze für den Druck nennen.** Zusätzlich zur Kapazität eine empfohlene Obergrenze je Code, abhängig von der Bonbreite. Rechnerisch bleiben auf 48 mm bei 203 dpi nur bis etwa Version 25 mindestens 3 Druckpunkte je Modul. Dazu Mindestmodulgröße und Ruhezone (4 Module) in Kap. 3.1 aufnehmen, damit der Verweis aus Kap. 2.2 nicht ins Leere läuft.
4. **Beispiele korrigieren und beilegen.** Alle drei Beispiele mit Fehlerkorrektur Q und abschließendem LF neu erzeugen und mit stimmigen Summen versehen (Netto und MwSt aus dem Satz, M-Zeilen aus den P-Zeilen). Die Datensätze zusätzlich als Textdatei veröffentlichen, nicht nur als Bild. Ein Beispiel mit Umlauten, Semikolon und Anführungszeichen im Artikeltext ergänzen.
5. **Regex und Text angleichen.** P2/M2 ohne Leerzeichen, K4-Text auf „1 bis 12 Ziffern (sowie 10¹²)“ oder die Regex auf 13 Ziffern erweitern, P4-Grenze auf genau ±50.000,00, E3 ohne „größer 0“, M-Beträge ohne führende Nullen, K7-Text „größer 50,00 (50,00 ausgeschlossen)“.
6. **Semantik ergänzen.**
   - P4 ist der Gesamtbetrag der Position.
   - P5 hat den Standardwert 1.
   - Rundungsregel für M4/M5, zum Beispiel „Netto je Steuersatz aus der Summe der Brutto-Beträge, kaufmännisch gerundet, MwSt = Brutto − Netto“.
   - Welche Summen das Backend prüft und mit welcher Toleranz.
   - Behandlung von Rabatt, Pfand, Gutschein und negativen Positionen.
   - K7 als Gesamtbetrag des Bons.
   - Eine eindeutige Aussage zur 50-€-Grenze.
7. **BON_NR definieren.** In Kap. 4.1 festhalten, welche Nummer gemeint ist, in welchem Bereich sie eindeutig sein muss (Unternehmen, Filiale, Kasse) und wie die Duplikatsprüfung genau lautet. Falls nur der Wert je Unternehmen eindeutig ist, ein optionales Feld **KASSEN_ID** am Ende der K-Zeile ergänzen (nach Kap. 1.4 abwärtskompatibel).
8. **Versionsfeld im Inhalt.** Ein optionales Feld am Ende der K-Zeile mit der Schnittstellenversion (z. B. `1.2`). Kap. 1.4 sieht eine Übergangsfrist mit mehreren akzeptierten Versionen vor, aus dem Code selbst ist die Version aber nicht erkennbar.
9. **TSE-Felder klären.** Entweder E4/E5 optional machen, damit Kassen ohne TSE und Ausfallfälle darstellbar sind, oder in Kap. 2.1 das „sofern belegt“ streichen. Falls die Signatur geprüft werden soll, die dafür nötigen Angaben (Signaturzähler, Transaktionsnummer, Algorithmus, Zeitformat) als optionale Felder am Ende von E definieren. Andernfalls ausdrücklich schreiben, dass E4/E5 nur durchgereicht werden.
10. **Mehrere Codes präzisieren.**
    - Mindestens eine P-Zeile über alle Codes statt je Primärcode, damit der Extremfall aus Frage 13 lösbar wird.
    - Beliebige Scanreihenfolge, wiederholte Scans sind folgenlos.
    - Zuordnung von Folgecodes über K4–K7 und das Verhalten bei fehlenden Folgecodes.
    - Verpflichtende K3 ab dem zweiten Code (steht schon in einer Fußnote, gehört in die Feldtabelle).
11. **Erkennbarkeit des Codes.** Der Inhalt beginnt direkt mit `K;`. Falls die App zwischen mehreren QR-Codes auf dem Bon unterscheiden muss, wäre ein Präfix oder die Versionsangabe aus Punkt 8 hilfreich.
12. **Testdatensätze veröffentlichen.** Eine Sammlung gültiger und gezielt ungültiger Inhalte mit erwartetem Ergebnis der App (angenommen, abgelehnt, mit Grund), idealerweise als maschinenlesbare Datei. Dazu eine Aussage, ob es eine Testumgebung gibt.
13. **Redaktionelle Punkte** aus Abschnitt 2 bereinigen.

---

Ich schicke Ihnen gern die Auswertung als Datei, die Testdatensätze, die ich für meine Prüfung erzeugt habe, oder den Simulator zum Ausprobieren. Für Rückmeldung zu den Fragen 1 bis 3, 5, 6 und 14 wäre ich besonders dankbar, weil davon die Umsetzung in Kassensystemen am meisten abhängt.

Mit freundlichen Grüßen
[Name]
