import { useRef, useState } from 'react';
import { TEMPLATE_FILE_KIND, computeTotals, euro, type SavedBon } from '../dakz';
import { download } from './exporting';
import { TEMPLATE_PREFIX, templateId } from './sources';
import type { AppState } from './state';
import type { BonActions } from './useBonActions';
import type { SavedBonsApi } from './useSavedBons';

interface Props {
  state: AppState;
  saved: SavedBonsApi;
  actions: BonActions;
  notify: (m: string) => void;
  setSource: (scenarioId: string) => void;
}

/** Aktuellen Bon als wiederverwendbaren Testfall abbilden. BON_NR, Zeit und TSE gehören nicht dazu. */
function toSavedBon(state: AppState, name: string, existing?: SavedBon): SavedBon {
  const { receipt } = state;
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? crypto.randomUUID(),
    name: name.trim().slice(0, 80) || 'Ohne Namen',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    positions: receipt.positions.map((p) => ({ ...p })),
    merchant: { ...state.merchant },
    options: { ...state.options, faults: { ...state.options.faults } },
    eccOverride: state.eccOverride,
    durationSec: Math.max(0, receipt.end - receipt.start),
    externalRef: /^REF_\d+$/.test(receipt.externalRef) ? '' : receipt.externalRef
  };
}

export function SavedBons({ state, saved, actions, notify, setSource }: Props) {
  const activeId = templateId(state.scenarioId);
  const active = saved.bons.find((b) => b.id === activeId);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveNew = () => {
    const bon = toSavedBon(state, name || `Bon mit ${state.receipt.positions.length} Positionen`);
    if (!saved.upsert(bon)) notify('Speichern nicht möglich – Browser-Speicher voll oder gesperrt');
    else notify(`„${bon.name}“ gespeichert`);
    setName('');
    // Der aktuelle Bon behält seine Nummer; „Nächster Bon“ baut ab jetzt auf dem gespeicherten auf.
    setSource(TEMPLATE_PREFIX + bon.id);
  };

  const saveChanges = () => {
    if (!active) return;
    saved.upsert(toSavedBon(state, active.name, active));
    notify(`„${active.name}“ aktualisiert`);
  };

  const exportAll = () => {
    const file = { kind: TEMPLATE_FILE_KIND, version: 1, exportedAt: new Date().toISOString(), bons: saved.bons };
    download(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `dakz-bons-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const importFile = async (file: File) => {
    try {
      const n = saved.importFile(JSON.parse(await file.text()));
      notify(n ? `${n} Bon${n > 1 ? 's' : ''} importiert` : 'Keine Bons in der Datei gefunden');
    } catch {
      notify('Datei ist kein gültiger Bon-Export');
    }
  };

  return (
    <div className="section">
      <h3>
        Meine Bons <small>im Browser gespeichert</small>
      </h3>
      {saved.bons.length === 0 ? (
        <p className="hint">Noch keine eigenen Bons. Stelle unten einen Einkauf zusammen und speichere ihn hier als Testfall.</p>
      ) : (
        <ul className="saved-list">
          {saved.bons.map((b) => {
            const total = computeTotals(b.positions).gross;
            return (
              <li key={b.id} className={b.id === activeId ? 'active' : ''}>
                <button className="saved-load" onClick={() => actions.newBon(TEMPLATE_PREFIX + b.id)} title="Laden – erhält eine neue Bon-Nr.">
                  <span className="saved-name">{b.name}</span>
                  <span className="meta">
                    {b.positions.length} Pos. · {euro(total)}
                    {Object.values(b.options.faults).some(Boolean) || b.eccOverride ? ' · mit Fehlern' : ''}
                  </span>
                </button>
                {confirmDelete === b.id ? (
                  <button
                    className="btn danger"
                    onClick={() => {
                      saved.remove(b.id);
                      setConfirmDelete(null);
                      notify(`„${b.name}“ gelöscht`);
                    }}
                    onBlur={() => setConfirmDelete(null)}
                    autoFocus
                  >
                    Wirklich löschen
                  </button>
                ) : (
                  <button className="icon-btn" aria-label={`${b.name} löschen`} onClick={() => setConfirmDelete(b.id)}>
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="row">
        <input id="save-name" placeholder="Name, z. B. Uhr + Parfum, 2 Sätze" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNew()} style={{ flex: '1 1 180px', width: 'auto' }} />
        <button className="btn primary" onClick={saveNew}>
          Als neuen Bon speichern
        </button>
      </div>
      <div className="row">
        {active && (
          <button className="btn" onClick={saveChanges}>
            Änderungen an „{active.name}“ speichern
          </button>
        )}
        <button className="btn" onClick={exportAll} disabled={!saved.bons.length}>
          Exportieren
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Importieren
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0]).finally(() => (e.target.value = ''))} />
      </div>
      <p className="hint">Gespeichert werden Positionen, Händler, Optionen und eingebaute Fehler. Beim Laden bekommt der Bon eine neue Bon-Nr. und die aktuelle Uhrzeit.</p>
    </div>
  );
}
