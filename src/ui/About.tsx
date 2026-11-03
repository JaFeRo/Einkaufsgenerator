import { QR_CAPACITY_Q_BYTES, SPECS, type SpecVersion } from '../dakz';

export function About({ spec }: { spec: SpecVersion }) {
  const p = SPECS[spec];
  const is13 = spec === '1.3';
  return (
    <main className="about">
      <section className="panel">
        <h2>Worauf der Simulator beruht</h2>
        <p>
          Grundlage ist die „Schnittstellendefinition QR-Code – Technische Beschreibung des Datenformats“ der Generalzolldirektion. Gewählt ist Version{' '}
          <b>{spec}</b> vom {p.date} ({p.status}); oben rechts lässt sich zwischen 1.2 und 1.3 wechseln. Fassung 1.3 ist auf{' '}
          <a href="https://www.zoll.de/DE/Service/Apps/eZOLL/Dienst-Ausfuhrkassenzettel/dienst-ausfuhrkassenzettel_node.html" target="_blank" rel="noreferrer">
            zoll.de unter „Dienst Ausfuhrkassenzettel“
          </a>{' '}
          veröffentlicht und hat dort Fassung 1.2 ersetzt. Der Code wird beim Einkauf auf den Kassenbon gedruckt und vom Unternehmen mit der {p.appName}{' '}
          eingescannt.
        </p>
        <ul>
          <li>
            <code>K</code> Kopf, genau einmal: Nummer, Gesamtanzahl, BON_NR, BON_START, BON_ENDE (Unix-Sekunden UTC), UMS_BRUTTO über 50,00 €
          </li>
          <li>
            <code>E</code> Erweitert, nur im ersten Code: Netto, MwSt,{' '}
            {is13 ? 'zwei reservierte Felder mit dem festen Wert „-1“, externe Referenz' : 'TSE-Signatur und öffentlicher Schlüssel (Base64), externe Referenz'}
          </li>
          <li>
            <code>M</code> je Steuersatz, 1–5 Zeilen, nur im ersten Code: Satz, Brutto, Netto, MwSt
          </li>
          <li>
            <code>P</code> je Position, 1–1000 Zeilen: Satz, erstattungsfähig, Brutto, Menge, Einheit, Artikeltext
          </li>
          <li>CSV mit Semikolon, LF als Zeilenende, {p.charsetLabel}, Dezimalkomma, keine Überschrift. Felder mit „;“ oder Anführungszeichen werden in Anführungszeichen gesetzt.</li>
          <li>Passt der Inhalt nicht in einen Code, folgen weitere Codes nur mit K- und P-Zeilen. Zeilen werden nie getrennt.</li>
        </ul>
      </section>
      <section className="panel">
        <h2>Unterschiede 1.2 und 1.3</h2>
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th></th>
                <th>1.2</th>
                <th>1.3</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Stand</td>
                <td>Version 1.2 vom 01.09.2026, abgelöst</td>
                <td>Version 1.3 vom 26.10.2026, aktuell auf zoll.de</td>
              </tr>
              <tr>
                <td>QR-Codierung (V3)</td>
                <td>„Alphanumerisch, UTF-8“ – mit dem Inhalt nur im Byte-Modus umsetzbar</td>
                <td>Byte-Modus, ISO 8859-1</td>
              </tr>
              <tr>
                <td>Zeichensatz (C1, C2)</td>
                <td>UTF-8</td>
                <td>ISO 8859-1 – „€“, „–“ und typografische Anführungszeichen sind nicht darstellbar (der Simulator ersetzt sie durch „?“)</td>
              </tr>
              <tr>
                <td>Kapazität (V4, Kap. 5)</td>
                <td>2.420 Zeichen, Fehlerkorrektur Q</td>
                <td>1.663 Zeichen, Q empfohlen, wird nicht geprüft</td>
              </tr>
              <tr>
                <td>E4, E5</td>
                <td>TSE_TA_SIG und TSE_PUBLIC_KEY, Base64 bis 512 Zeichen, Pflicht</td>
                <td>RESERVED1 und RESERVED2, Pflicht, genau „-1“ – keine TSE-Daten mehr im Code</td>
              </tr>
              <tr>
                <td>E6</td>
                <td>externeKundenReferenz, optional</td>
                <td>unverändert</td>
              </tr>
              <tr>
                <td>Versionsangabe im Code</td>
                <td>keine</td>
                <td>keine – die Fassung ist nur an E4/E5 erkennbar</td>
              </tr>
              <tr>
                <td>Duplikatsprüfung (Kap. 2.1)</td>
                <td>BON_NR, Unternehmen, Zeitstempel, sofern belegt TSE-Felder</td>
                <td>BON_NR, Unternehmen, Zeitstempel, daP</td>
              </tr>
              <tr>
                <td>P2, M2 Steuersatz</td>
                <td>Regex mit Leerzeichen: <code>{'^\\d{1,2} (,\\d{1,2})?$'}</code></td>
                <td>Leerzeichen entfernt: <code>{'^\\d{1,2}(,\\d{1,2})?$'}</code></td>
              </tr>
              <tr>
                <td>P4 Positionsbrutto</td>
                <td><code>{'^(-?[1-4]?\\d{1,4}|-?50000|0),\\d{2}$'}</code> – lässt bis ±50.000,99 zu</td>
                <td><code>{'^(?!-?0\\d)(-?[1-4]?\\d{1,4},\\d{2}|-?50000|0)$'}</code> – ±50000 und 0 nur ohne Nachkommastellen, 50000,00 wird abgelehnt</td>
              </tr>
              <tr>
                <td>M3–M5</td>
                <td><code>{'^-?([0-4]?\\d{1,7}),\\d{2}$'}</code> – führende Nullen möglich</td>
                <td><code>{'^(?!-?0\\d)(-?[0-4]?\\d{1,7}),\\d{2}$'}</code> – ohne führende Nullen</td>
              </tr>
              <tr>
                <td>Feldbeschreibungen</td>
                <td>K4 „1 bis 13 Ziffern“ (Regex: 12); P5 ohne Standardwert</td>
                <td>K4 „1 bis 12 Ziffern (sowie 10¹²)“; K7 „echt größer 50“ über alle Positionen; P5 Standard 1; M5 = M3 − M4</td>
              </tr>
              <tr>
                <td>Zeilentypen (Kap. 3.2)</td>
                <td>alle vier mandatorisch</td>
                <td>Folgecodes (nur K und P) als Ausnahme genannt</td>
              </tr>
              <tr>
                <td>Beispiele (Kap. 6)</td>
                <td>6.1, 6.2 (5 Steuersätze), 6.3 (Überlauf); Fehlerkorrektur L bzw. M</td>
                <td>6.1 und 6.2 (Überlauf, früher 6.3) mit „-1“ in E4/E5; Zeilenende LF; weiterhin UTF-8; 6.1 mit Fehlerkorrektur M, 6.2 mit Q</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="hint">
          Die Rückprüfung erkennt die Fassung je Bon an E4/E5 und die Kodierung an den Rohbytes. Weicht die Kodierung von der Fassung ab, meldet sie eine Warnung:
          Die App liest UTF-8 und ISO 8859-1. Ein 1.3-Code erfüllt auch die Feldregeln von 1.2 („-1“ passt auf die TSE-Regex), ein 1.2-Code fällt unter 1.3 an
          E4/E5 durch. Nach Kap. 1.4 (Toleranzprinzip) müssen Leser unbekannte zusätzliche Felder am Zeilenende ignorieren; der Prüfer meldet sie nur als Warnung.
        </p>
      </section>
      <section className="panel">
        <h2>Wie der Simulator Unklarheiten auflöst</h2>
        <ul>
          <li>
            <b>Kapazität:</b>{' '}
            {is13
              ? 'Fassung 1.3 nennt 1.663 Zeichen. In ISO 8859-1 ist jedes Zeichen ein Byte, das passt genau zu Version 40 mit Fehlerkorrektur Q im Byte-Modus.'
              : 'Die Spezifikation nennt 2.420 Zeichen. Das ist die Grenze des alphanumerischen QR-Modus, der keine Kleinbuchstaben, Semikolons oder Umlaute kann.'}{' '}
            Der Simulator kodiert im Byte-Modus mit Fehlerkorrektur Q und teilt ab {QR_CAPACITY_Q_BYTES.toLocaleString('de-DE')} Byte auf.
          </li>
          <li>
            <b>Fehlerkorrektur:</b> immer Q{is13 ? ' (in 1.3 nur empfohlen)' : ''}. Die Zoll-Beispiele nutzen teils L und M; zum Gegentest lässt sich unter „Fehler
            einbauen“ M wählen.
          </li>
          {is13 ? (
            <li>
              <b>Positionsbrutto:</b> Der Text erlaubt ±50.000, die Regex nur ±50000 ohne Nachkommastellen. „50000,00“ meldet der Prüfer als Fehler mit Hinweis.
            </li>
          ) : (
            <>
              <li>
                <b>Steuersatz:</b> Die Regex im PDF enthält ein Leerzeichen, das kein Beispiel erfüllt. Geprüft wird ohne Leerzeichen; „19“ und „19,00“ sind
                beide gültig.
              </li>
              <li>
                <b>Positionsbrutto:</b> Die Regex lässt 50.000,01 bis 50.000,99 zu, der Text nennt ±50.000. Der Prüfer warnt in diesem Bereich.
              </li>
            </>
          )}
          <li>
            <b>Zeichenkodierung:</b> Erzeugt wird in der Kodierung der Fassung ({p.charsetLabel}). Die App liest UTF-8 und ISO 8859-1, eine abweichende Kodierung
            meldet der Prüfer daher als Warnung, nicht als Fehler.
          </li>
          <li>
            <b>Summen:</b> Konsistenzregeln stehen nicht in der Spezifikation. Abweichungen zwischen K7, E2, E3, M- und P-Zeilen meldet der Prüfer als Warnung.
            {is13 ? 'Das Zoll-Beispiel 6.2 löst' : 'Die Zoll-Beispiele 6.2 und 6.3 lösen'} solche Warnungen selbst aus.
          </li>
          <li>
            <b>TSE:</b> {is13 ? 'Ab 1.3 steht in E4/E5 nur „-1“, die TSE-Daten druckt der Bon weiterhin. ' : ''}Wahlweise zufällige Base64-Werte oder eine echte ECDSA-Signatur
            (P-384) mit einem Sitzungsschlüssel. Beides ist kein zertifiziertes TSE-Format.
          </li>
        </ul>
      </section>
      <section className="panel">
        <h2>Hinweise zum Testen</h2>
        <ul>
          <li>Scanmodus: Code bildschirmfüllend, Pfeiltasten wechseln Teilcodes, Leertaste erzeugt den nächsten Bon, N den gleichen Einkauf mit neuer Bon-Nr.</li>
          <li>
            Das dAKZ-Backend erkennt Duplikate über BON_NR, Unternehmen und Zeitstempel{is13 ? ' sowie die daP' : ''}. Jeder neue Bon bekommt deshalb die nächste freie Nummer vom Zähler. Der
            Zähler liegt im Browser; testen mehrere Personen, sollte jede einen eigenen Startbereich wählen.
          </li>
          <li>Eigene Bons speichern Positionen, Händler, Optionen und eingebaute Fehler. Beim Laden gibt es eine neue Bon-Nr. und die aktuelle Uhrzeit.</li>
          <li>
            Druck: Papierbreite 58 oder 80 mm wählen, im Druckdialog Ränder auf „keine“ und Skalierung auf 100 % stellen. Die Modulgröße ist fest (Standard 4 Punkte
            = 0,5 mm bei 203 dpi): Kleine Codes werden klein gedruckt, größere wachsen, bis sie die Druckbreite füllen.
          </li>
          <li>„Link teilen“ legt den kompletten Bon in die Adresse, damit ein Testfall reproduzierbar bleibt.</li>
          <li>Alle Belege tragen den Aufdruck „TESTBELEG“ und fiktive Händlerdaten. Sie sind keine steuerlich gültigen Belege.</li>
        </ul>
      </section>
    </main>
  );
}
