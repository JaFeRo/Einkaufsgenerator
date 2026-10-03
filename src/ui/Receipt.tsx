import { euro, formatEpoch, formatQty, money, positionGross, type Merchant, type Receipt as ReceiptData } from '../dakz';
import { QrSvg } from './QrSvg';
import type { PaperWidth } from './state';
import type { RenderedBon } from './useCodes';

const vatLetter = (rate: number) => (rate === 19 ? 'A' : rate === 7 ? 'B' : `${String(rate).replace('.', ',')}%`);

interface Props {
  receipt: ReceiptData;
  merchant: Merchant;
  bon: RenderedBon;
  paper: PaperWidth;
}

export function Receipt({ receipt, merchant, bon, paper }: Props) {
  const t = bon.totals;
  const stars = '*'.repeat(48);
  return (
    <article className={`receipt ${paper === 58 ? 'w58' : ''}`} aria-label={`Kassenbon ${receipt.bonNr}`}>
      <div className="stamp" aria-hidden="true">TESTBELEG</div>
      <div className="c b big">{merchant.name}</div>
      <div className="c">{merchant.address}</div>
      <div className="c small">USt-IdNr. {merchant.vatId}</div>
      <div className="rule" />
      {receipt.positions.map((p, i) => (
        <div key={i}>
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
        <span>Bon {receipt.bonNr}</span>
        <span>{merchant.register}</span>
      </div>
      <div>{formatEpoch(receipt.start, false)}</div>
      <div className="rule" />
      <div>TSE Start: {formatEpoch(receipt.start, true)}</div>
      <div>TSE Ende:  {formatEpoch(receipt.end, true)}</div>
      <div>TSE-Signatur:</div>
      <div className="sig">{receipt.tseSignature}</div>
      <div className="rule" />
      <div className="c b">Digitaler Ausfuhrkassenzettel</div>
      <div className="c small">Einkaufsdaten für dAKZ – mit der eZOLL-App scannen</div>
      {bon.codes.map((c) => (
        <div className="qr-block" key={c.index}>
          {c.matrix ? <QrSvg matrix={c.matrix} label={`QR-Code ${c.index} von ${c.count}`} /> : <div className="qr-err">{c.qrError}</div>}
          <div className="qr-cap">
            QR {c.index}/{c.count}
            {c.matrix && ` · V${c.matrix.version} · ${c.bytes} Byte`}
          </div>
        </div>
      ))}
      <div className="rule" />
      <div className="c small">Simulation · kein steuerlich gültiger Beleg</div>
      <div className="c small">Summe {euro(t.gross)}</div>
    </article>
  );
}
