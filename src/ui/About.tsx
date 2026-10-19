import { QR_CAPACITY_Q_BYTES } from '../dakz';

export function About() {
  return (
    <main className="about">
      <section className="panel">
        <h2>Worauf der Simulator beruht</h2>
        <p>
          Grundlage ist die „Schnittstellendefinition QR-Code – Technische Beschreibung des Datenformats“ der Generalzolldirektion, Version 1.2 vom
          01.09.2026, veröffentlicht auf{' '}
          <a href="https://www.zoll.de/DE/Fachthemen/Steuern/Umsatzsteuererstattung/anbindung_dakz_ezoll.html" target="_blank" rel="noreferrer">
            zoll.de
          </a>
          . Der Code wird beim Einkauf auf den Kassenbon gedruckt und vom Unternehmen mit der eZOLL-App (Dienst „Ausfuhrkassenzettel“) eingescannt.
        </p>
        <ul>
          <li>
            <code>K</code> Kopf, genau einmal: Nummer, Gesamtanzahl, BON_NR, BON_START, BON_ENDE (Unix-Sekunden UTC), UMS_BRUTTO über 50,00 €
          </li>
          <li>
            <code>E</code> Erweitert, nur im ersten Code: Netto, MwSt, TSE-Signatur und öffentlicher Schlüssel (Base64), externe Referenz
          </li>
          <li>
            <code>M</code> je Steuersatz, 1–5 Zeilen, nur im ersten Code: Satz, Brutto, Netto, MwSt
          </li>
          <li>
            <code>P</code> je Position, 1–1000 Zeilen: Satz, erstattungsfähig, Brutto, Menge, Einheit, Artikeltext
          </li>
          <li>CSV mit Semikolon, LF als Zeilenende, UTF-8, Dezimalkomma, keine Überschrift. Felder mit „;“ oder Anführungszeichen werden in Anführungszeichen gesetzt.</li>
          <li>Passt der Inhalt nicht in einen Code, folgen weitere Codes nur mit K- und P-Zeilen. Zeilen werden nie getrennt.</li>
        </ul>
      </section>
      <section className="panel">
        <h2>Wie der Simulator Unklarheiten auflöst</h2>
        <ul>
          <li>
            <b>Kapazität:</b> Die Spezifikation nennt 2.420 Zeichen. Das ist die Grenze des alphanumerischen QR-Modus, der keine Kleinbuchstaben, Semikolons oder
            Umlaute kann. Der Simulator kodiert im Byte-Modus mit Fehlerkorrektur Q und teilt ab {QR_CAPACITY_Q_BYTES.toLocaleString('de-DE')} Byte auf.
          </li>
          <li>
            <b>Fehlerkorrektur:</b> immer Q. Die Zoll-Beispiele nutzen L und M; zum Gegentest lässt sich unter „Fehler einbauen“ M wählen.
          </li>
          <li>
            <b>Steuersatz:</b> Die Regex im PDF enthält ein Leerzeichen, das kein Beispiel erfüllt. Geprüft wird ohne Leerzeichen; „19“ und „19,00“ sind
            beide gültig.
          </li>
          <li>
            <b>Positionsbrutto:</b> Die Regex lässt 50.000,01 bis 50.000,99 zu, der Text nennt ±50.000. Der Prüfer warnt in diesem Bereich.
          </li>
          <li>
            <b>Summen:</b> Konsistenzregeln stehen nicht in der Spezifikation. Abweichungen zwischen K7, E2, E3, M- und P-Zeilen meldet der Prüfer als Warnung.
            Die Zoll-Beispiele 6.2 und 6.3 lösen solche Warnungen selbst aus.
          </li>
          <li>
            <b>TSE:</b> Wahlweise zufällige Base64-Werte oder eine echte ECDSA-Signatur (P-384) mit einem Sitzungsschlüssel. Beides ist kein zertifiziertes TSE-Format.
          </li>
        </ul>
      </section>
      <section className="panel">
        <h2>Hinweise zum Testen</h2>
        <ul>
          <li>Scanmodus: Code bildschirmfüllend, Pfeiltasten wechseln Teilcodes, Leertaste erzeugt den nächsten Bon, N den gleichen Einkauf mit neuer Bon-Nr.</li>
          <li>
            Das dAKZ-Backend erkennt Duplikate über BON_NR, Unternehmen und Zeitstempel. Jeder neue Bon bekommt deshalb die nächste freie Nummer vom Zähler. Der
            Zähler liegt im Browser; testen mehrere Personen, sollte jede einen eigenen Startbereich wählen.
          </li>
          <li>Eigene Bons speichern Positionen, Händler, Optionen und eingebaute Fehler. Beim Laden gibt es eine neue Bon-Nr. und die aktuelle Uhrzeit.</li>
          <li>Druck: Papierbreite 58 oder 80 mm wählen, im Druckdialog Ränder auf „keine“ stellen. Der Prüfer zeigt die zu erwartende Modulgröße.</li>
          <li>„Link teilen“ legt den kompletten Bon in die Adresse, damit ein Testfall reproduzierbar bleibt.</li>
          <li>Alle Belege tragen den Aufdruck „TESTBELEG“ und fiktive Händlerdaten. Sie sind keine steuerlich gültigen Belege.</li>
        </ul>
      </section>
    </main>
  );
}
