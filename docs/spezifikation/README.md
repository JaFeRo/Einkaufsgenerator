# Spezifikation

Archiv der „Schnittstellendefinition QR-Code – Technische Beschreibung des Datenformats“ (Generalzolldirektion), damit spätere Fassungen verglichen werden können.

| Datei | Version | Stand | Bezogen |
|---|---|---|---|
| `Schnittstellendefinition_QR-Code_1.3.pdf` | 1.3 vom 26.10.2026 | aktuell | 03.11.2026 von zoll.de |

Quelle: [zoll.de – Dienst Ausfuhrkassenzettel](https://www.zoll.de/DE/Service/Apps/eZOLL/Dienst-Ausfuhrkassenzettel/dienst-ausfuhrkassenzettel_node.html) → „Anforderungen an den QR-Code“
(`anforderungen_an_qr_code.pdf?__blob=publicationFile&v=3`).

SHA-256 1.3: `18873413a3211f0f75da57271b05a21d231abf212fb2513ce37929cb8c316b0f`

Fassung 1.2 (01.09.2026) ist auf zoll.de nicht mehr abrufbar. Ihre Inhalte sind im Code (`src/dakz/validate.ts`, `SPEC_12`), in den Beispielen (`src/dakz/zoll-beispiele.json`) und in `docs/RUECKFRAGEN-SCHNITTSTELLE.md` festgehalten.

Bei einer neuen Fassung: PDF hier ablegen, Tabelle ergänzen, Unterschiede in `src/dakz/spec.ts` und auf der Spezifikationsseite (`src/ui/About.tsx`) nachziehen.
