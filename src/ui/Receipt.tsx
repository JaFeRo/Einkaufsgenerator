import { SPECS, euro, formatEpoch, formatQty, money, positionGross, type Merchant, type Receipt as ReceiptData } from '../dakz';
import type { CSSProperties } from 'react';
import { fmtDots, fmtMm, printableMm, qrLayout, type ModuleDots } from '../qr/layout';
import { QrSvg } from './QrSvg';
import type { PaperWidth } from './state';
import type { RenderedBon } from './useCodes';

const vatLetter = (rate: number) => (rate === 19 ? 'A' : rate === 7 ? 'B' : `${String(rate).replace('.', ',')}%`);

interface Props {
  receipt: ReceiptData;
  merchant: Merchant;
  bon: RenderedBon;
  paper: PaperWidth;
  moduleDots: ModuleDots;
  /** Demo-Modus: groß, ohne technische Angaben unter dem QR-Code */
  variant?: 'demo';
  slogan?: string;
  /** Fußzeilen des Händlers */
  footer?: string[];
  /** Bon noch offen: keine Bon-Nr., keine TSE-Daten, Platzhalter statt QR-Code */
  pending?: boolean;
}

export function Receipt({ receipt, merchant, bon, paper, moduleDots, variant, slogan, footer, pending = false }: Props) {
  const t = bon.totals;
  const stars = '*'.repeat(48);
  const demo = variant === 'demo';
  return (
    <article
      className={`receipt ${paper === 58 ? 'w58' : ''} ${demo ? 'demo-receipt' : ''}`}
      aria-label={`Kassenbon ${receipt.bonNr}`}
      style={{ '--print-mm': printableMm(paper) } as CSSProperties}
    >
      <div className="stamp" aria-hidden="true">TESTBELEG</div>
      <div className="c b big">{merchant.name}</div>
      <div className="c">{merchant.address}</div>
      <div className="c small">USt-IdNr. {merchant.vatId}</div>
      {slogan && <div className="c small slogan">{slogan}</div>}
      <div className="rule" />
      {pending && receipt.positions.length === 0 && <div className="c small">Noch keine Artikel erfasst</div>}
      {receipt.positions.map((p, i) => (
        <div key={i} className="pos">
          <div className="ln">
            <span>{p.text}</span>
            <span>
              {money(positionGross(p))} {vatLetter(p.vat)}
            </span>
          </div>
          {(p.qty !== 1 || p.unit !== 'Stück') && (
            <div className="sub">
              {formatQty(p.qty)} {p.unit} × {money(Math.round(p.unitPrice * 100))}
            </div>
          )}
          {!p.refundable && <div className="sub">nicht erstattungsfähig</div>}
        </div>
      ))}
      <div className="rule" />
      <div className="ln b big">
        <span>SUMME EUR</span>
        <span>{money(t.gross)}</span>
      </div>
      <div className="ln">
        <span>Karte: VISA</span>
        <span>{money(t.gross)}</span>
      </div>
      <div className="stars">{stars}</div>
      {t.vatLines.map((l) => (
        <div className="ln" key={l.rate}>
          <span>
            {vatLetter(l.rate)} {String(l.rate).replace('.', ',')} % Netto {money(l.net)}
          </span>
          <span>{money(l.vat)}</span>
        </div>
      ))}
      <div className="ln">
        <span>Nettoumsatz</span>
        <span>{money(t.net)}</span>
      </div>
      <div className="stars">{stars}</div>
      <div className="ln">
        <span>{pending ? 'Bon wird erfasst' : `Bon ${receipt.bonNr}`}</span>
        <span>{merchant.register}</span>
      </div>
      <div>{formatEpoch(receipt.start, false)}</div>
      {!pending && (
        <>
          <div className="rule" />
          <div>TSE Start: {formatEpoch(receipt.start, true)} UTC</div>
          <div>TSE Ende:  {formatEpoch(receipt.end, true)} UTC</div>
          <div>TSE-Signatur:</div>
          <div className="sig">{receipt.tseSignature}</div>
        </>
      )}
      <div className="rule" />
      <div className="c b">Digitaler Ausfuhrkassenzettel</div>
      <div className="c small">Einkaufsdaten für dAKZ – mit der {SPECS[bon.spec].appName} scannen</div>
      {pending && <div className="qr-placeholder">QR-Code erscheint nach Abschluss</div>}
      {!pending &&
        bon.codes.map((c) => {
          const layout = c.matrix ? qrLayout(c.matrix.size, moduleDots, paper) : null;
          return (
            <div className="qr-block" key={c.index}>
              {c.matrix && layout ? (
                // Im Demo-Modus füllt der Code die Bonbreite, damit er vom Beamer scanbar bleibt
                <QrSvg matrix={c.matrix} label={`QR-Code ${c.index} von ${c.count}`} style={demo ? undefined : ({ '--qr-mm': layout.widthMm } as CSSProperties)} />
              ) : (
                <div className="qr-err">{c.qrError}</div>
              )}
              {(!demo || c.count > 1) && (
                <div className="qr-cap">
                  QR {c.index}/{c.count}
                  {!demo && c.matrix && layout && ` · V${c.matrix.version} · ${c.bytes} Byte · ${fmtMm(layout.widthMm)} mm · ${fmtDots(layout.dots)} Punkte${layout.shrunk ? ' (angepasst)' : ''}`}
                </div>
              )}
            </div>
          );
        })}
      {footer && footer.length > 0 && (
        <>
          <div className="rule" />
          {footer.map((f) => (
            <div className="c small" key={f}>
              {f}
            </div>
          ))}
        </>
      )}
      <div className="rule" />
      <div className="c small">Simulation · kein steuerlich gültiger Beleg</div>
      <div className="c small">Summe {euro(t.gross)}</div>
    </article>
  );
}
