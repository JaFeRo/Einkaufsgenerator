import { useState, type Dispatch } from 'react';
import { deriveExternalRef, isValidBonNr } from '../dakz';
import type { Action, AppState } from './state';
import type { BonActions } from './useBonActions';
import type { BonCounter } from './useBonCounter';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  counter: BonCounter;
  actions: BonActions;
}

/** BON_NR mit fortlaufendem Zähler. Die Duplikatsprüfung im dAKZ-Backend läuft über diese Nummer. */
export function BonNumberField({ state, dispatch, counter, actions }: Props) {
  const { bonNr } = state.receipt;
  const [editCounter, setEditCounter] = useState(false);
  const [draft, setDraft] = useState('');
  const invalid = !isValidBonNr(bonNr);

  return (
    <div className="field bon-nr" style={{ gridColumn: '1 / -1' }}>
      <label htmlFor="bon-nr">BON_NR (K4) – eindeutig je Scan</label>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input
          id="bon-nr"
          className={`num ${invalid || actions.duplicate ? 'invalid' : ''}`}
          inputMode="numeric"
          value={bonNr}
          onChange={(e) => {
            const next = e.target.value.trim();
            const ref = state.receipt.externalRef === `REF_${bonNr}` ? deriveExternalRef(state.receipt.externalRef, next) : state.receipt.externalRef;
            dispatch({ type: 'receipt', patch: { bonNr: next, externalRef: ref } });
          }}
          style={{ flex: '1 1 120px', fontSize: 16, fontWeight: 500 }}
        />
        <button className="btn primary" onClick={actions.renumber} title="Nächste freie Nummer vom Zähler, gleicher Einkauf, neue Uhrzeit">
          Neue Bon-Nr.
        </button>
      </div>
      {invalid && <span className="msg err">Nur Ziffern, ohne führende Null, höchstens 10¹².</span>}
      {actions.duplicate && <span className="msg err">Bon-Nr. {bonNr} wurde schon verwendet – beim Scannen würde der Bon als Duplikat abgelehnt.</span>}
      <span className="msg">
        {editCounter ? (
          <span className="row" style={{ gap: 6 }}>
            Zähler auf
            <input
              id="counter-next"
              className="num"
              inputMode="numeric"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && isValidBonNr(draft) && (counter.setNext(Number(draft)), setEditCounter(false))}
              style={{ width: 130 }}
            />
            <button className="btn" disabled={!isValidBonNr(draft)} onClick={() => (counter.setNext(Number(draft)), setEditCounter(false))}>
              Setzen
            </button>
            <button className="btn" onClick={() => setEditCounter(false)}>
              Abbrechen
            </button>
          </span>
        ) : (
          <>
            Nächste Nummer vom Zähler: <b className="mono">{counter.next}</b> · {counter.issuedCount} vergeben ·{' '}
            <button
              className="link-btn"
              onClick={() => {
                setDraft(String(counter.next));
                setEditCounter(true);
              }}
            >
              Zähler ändern
            </button>
          </>
        )}
      </span>
    </div>
  );
}
