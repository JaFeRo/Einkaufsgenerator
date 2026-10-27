import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeBytes, detectSpec, fieldSpecs, formatEpoch, parseContent, SPECS, validateCode, validateSet, type Finding, type SpecVersion } from '../dakz';
import examples from '../dakz/zoll-beispiele.json';
import examples13 from '../dakz/zoll-beispiele-13.json';
import type { ScannedCode } from '../scan/reader';
import { CsvView, Findings, StatusPill } from './Findings';

/** Eingelesener Code; bei eingetipptem Text ist die Kodierung unbekannt. */
type Scanned = Omit<ScannedCode, 'detected'> & { detected?: ScannedCode['detected'] };

interface Entry {
  id: number;
  scanned: Scanned;
}

type SpecMode = 'auto' | 'selected';

interface BonGroup {
  key: string;
  entries: Entry[];
}

// zxing-wasm erst laden, wenn die Rückprüfung wirklich etwas einliest.
const loadReader = () => import('../scan/reader');

let nextId = 1;

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

function groupKey(entry: Entry): string {
  const k = parseContent(entry.scanned.text)[0];
  return k?.[0] === 'K' ? [k[3], k[4], k[5], k[6]].join('|') : `ungueltig-${entry.id}`;
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 1320;
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.08);
    o.onended = () => ctx.close();
  } catch {
    /* Ton ist optional */
  }
}

export function Checker({ notify, spec }: { notify: (m: string) => void; spec: SpecVersion }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [mode, setMode] = useState<SpecMode>('auto');
  const [text, setText] = useState('');
  const [camera, setCamera] = useState<'off' | 'starting' | 'on'>('off');
  const [camError, setCamError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [over, setOver] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seen = useRef(new Set<string>());

  const add = useCallback((codes: Scanned[], quiet = false) => {
    const fresh = codes.filter((c) => !seen.current.has(c.text));
    if (!fresh.length) {
      if (codes.length && !quiet) notify('Bereits erfasst');
      return 0;
    }
    fresh.forEach((c) => seen.current.add(c.text));
    setEntries((list) => [...list, ...fresh.map((scanned) => ({ id: nextId++, scanned }))]);
    return fresh.length;
  }, [notify]);

  // ---------- Kamera ----------
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamera('off');
  }, []);

  const startCamera = async () => {
    setCamError(null);
    setCamera('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = stream;
      setCamera('on');
    } catch (e) {
      setCamera('off');
      setCamError(
        (e as Error).name === 'NotAllowedError'
          ? 'Kein Zugriff auf die Kamera. Bitte den Zugriff im Browser erlauben oder ein Foto hochladen.'
          : 'Keine Kamera gefunden. Alternativ ein Foto des Bons hochladen.'
      );
    }
  };

  useEffect(() => {
    if (camera !== 'on' || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          const { scanImage } = await loadReader();
          const found = await scanImage(ctx.getImageData(0, 0, canvas.width, canvas.height), 'Kamera', false);
          if (add(found, true) > 0) {
            beep();
            setFlash(true);
            setTimeout(() => setFlash(false), 120);
          }
        } catch {
          /* Einzelbild nicht lesbar – nächster Versuch */
        }
      }
      timer = window.setTimeout(tick, 200);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [camera, add]);

  useEffect(() => stopCamera, [stopCamera]);

  // ---------- Bilder ----------
  const scanFiles = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    const { scanImage } = await loadReader();
    let found = 0;
    let added = 0;
    for (const file of list) {
      const codes = await scanImage(file, file.name || 'Bild');
      found += codes.length;
      added += add(codes, true);
    }
    notify(found ? `${found} QR-Code${found > 1 ? 's' : ''} gefunden, ${added} neu` : 'Kein QR-Code im Bild gefunden');
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.some((f) => f.type.startsWith('image/'))) {
        e.preventDefault();
        void scanFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const addText = () => {
    const t = text.replace(/\r\n/g, '\n');
    if (!t.trim()) return;
    // Mehrere Codes lassen sich durch eine Leerzeile getrennt einfügen.
    const parts = t.split(/\n\s*\n(?=K;)/).map((p, i, arr) => (i < arr.length - 1 ? p + '\n' : p));
    add(parts.map((p) => ({ text: p, ecLevel: '', version: '', source: 'Text' })));
    setText('');
  };

  const loadExamples = () => {
    add(
      [examples.ex61, examples.ex62, examples.ex63a].map((t, i) => ({ text: t, detected: 'utf-8' as const, ecLevel: ['L', 'L', 'M'][i], version: '', source: `Zoll-Beispiel 1.2 · ${['6.1', '6.2', '6.3 (1/2)'][i]}` }))
    );
  };

  // Die QR-Codes der Fassung 1.3 als Rohbytes, so wie sie im Dokument abgebildet sind (Abb. 4 ist nur der Text zu Abb. 5).
  const loadExamples13 = () => {
    const raw: [string, Uint8Array][] = [
      ['Abb. 5 (6.1)', fromBase64(examples13.abb5)],
      ['Abb. 7', fromBase64(examples13.abb7)],
      ['Abb. 9 (1/2)', fromBase64(examples13.abb9)],
      ['Abb. 11 (2/2)', fromBase64(examples13.abb11)]
    ];
    add(raw.map(([name, bytes]) => ({ ...decodeBytes(bytes), ecLevel: '', version: '', source: `Zoll-Beispiel 1.3 · ${name}` })));
  };

  const clear = () => {
    seen.current.clear();
    setEntries([]);
  };

  const groups = useMemo<BonGroup[]>(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = groupKey(e);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()].map(([key, list]) => ({ key, entries: list })).reverse();
  }, [entries]);

  return (
    <main className="checker">
      <section className="panel" aria-labelledby="h-input">
        <h2 id="h-input">Codes einlesen</h2>
        <div className="section">
          <h3>
            Kamera <small>Bon oder Bildschirm vor die Kamera halten</small>
          </h3>
          {camera !== 'off' && (
            <div className="video-box">
              <video ref={videoRef} playsInline muted />
              <div className="frame" />
              <div className={`flash ${flash ? 'on' : ''}`} />
            </div>
          )}
          <div className="row">
            {camera === 'off' ? (
              <button className="btn primary" onClick={startCamera}>
                Kamera starten
              </button>
            ) : (
              <button className="btn" onClick={stopCamera}>
                Kamera stoppen
              </button>
            )}
            {camera === 'starting' && <span className="hint">Warte auf Freigabe …</span>}
          </div>
          {camError && <p className="hint" style={{ color: 'var(--err)' }}>{camError}</p>}
        </div>

        <div className="section">
          <h3>
            Foto oder Screenshot <small>auch per Einfügen (Strg+V)</small>
          </h3>
          <label
            className={`drop ${over ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void scanFiles(e.dataTransfer.files);
            }}
          >
            Bilder hierher ziehen oder <u>auswählen</u>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void scanFiles(e.target.files)} />
          </label>
        </div>

        <div className="section">
          <h3>
            Inhalt als Text <small>z. B. aus einem Scanner im Tastaturmodus</small>
          </h3>
          <textarea id="raw-text" rows={5} placeholder={'K;1;;302592;1770201944;1770201945;105,20\nE;…'} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'var(--font-data)', fontSize: 12 }} />
          <div className="row">
            <button className="btn" onClick={addText} disabled={!text.trim()}>
              Prüfen
            </button>
            <button className="btn" onClick={loadExamples}>
              Zoll-Beispiele 1.2
            </button>
            <button className="btn" onClick={loadExamples13}>
              Zoll-Beispiele 1.3
            </button>
            {entries.length > 0 && (
              <button className="btn" onClick={clear}>
                Liste leeren
              </button>
            )}
          </div>
          <p className="hint">Mehrere Codes durch eine Leerzeile trennen. Gleiche Inhalte werden nur einmal erfasst.</p>
        </div>

        <div className="section">
          <h3>
            Prüfen nach <small>Fassung der Spezifikation</small>
          </h3>
          <div className="seg" role="radiogroup" aria-label="Prüfen nach">
            <button role="radio" aria-checked={mode === 'auto'} aria-selected={mode === 'auto'} onClick={() => setMode('auto')}>
              Automatisch erkennen
            </button>
            <button role="radio" aria-checked={mode === 'selected'} aria-selected={mode === 'selected'} onClick={() => setMode('selected')}>
              Immer {spec}
            </button>
          </div>
          <p className="hint">
            {mode === 'auto'
              ? `Die Fassung wird je Bon aus K8 oder der Feldzahl der E-Zeile erkannt. Folgecodes ohne K8 und eingetippter Text ohne Hinweis werden nach ${spec} geprüft (oben gewählt).`
              : `Alle Codes werden nach Fassung ${spec} geprüft, auch wenn sie nach einer anderen Fassung erzeugt wurden.`}
          </p>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
        {groups.length === 0 && (
          <section className="panel empty">
            <strong>Noch keine Codes erfasst</strong>
            Kamera starten, ein Foto hochladen oder Text einfügen. Codes eines Bons werden automatisch zusammengeführt und gemeinsam geprüft.
            <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
              <button className="btn" onClick={loadExamples}>
                Zoll-Beispiele 1.2
              </button>
              <button className="btn" onClick={loadExamples13}>
                Zoll-Beispiele 1.3
              </button>
            </div>
          </section>
        )}
        {groups.map((g) => (
          <BonCard key={g.key} group={g} selected={spec} mode={mode} sameBonNr={groups.filter((o) => o !== g && o.key.split('|')[0] === g.key.split('|')[0] && !o.key.startsWith('ungueltig')).length} />
        ))}
      </div>
    </main>
  );
}

function BonCard({ group, sameBonNr, selected, mode }: { group: BonGroup; sameBonNr: number; selected: SpecVersion; mode: SpecMode }) {
  const [open, setOpen] = useState<number | null>(null);
  // Fassung je Bon: erste eindeutige Angabe (K8 oder E-Zeile) gilt auch für die Folgecodes.
  const detections = group.entries.map((e) => detectSpec(parseContent(e.scanned.text)));
  const found = detections.find((d) => d.version);
  const spec: SpecVersion = mode === 'auto' ? found?.version ?? selected : selected;
  const specNote = mode === 'selected' ? 'fest gewählt' : found ? `erkannt: ${found.reason}` : 'keine Angabe im Code, gewählte Fassung';
  const versions = new Set(detections.map((d) => d.version).filter(Boolean));

  const entries = group.entries
    .map((e) => ({ ...e, check: validateCode(e.scanned.text, { spec, detectedCharset: e.scanned.detected }) }))
    .sort((a, b) => +(a.check.records[0]?.[1] ?? 0) - +(b.check.records[0]?.[1] ?? 0));
  const set = validateSet(entries.map((e) => e.scanned.text));
  const k = entries[0].check.records[0]?.[0] === 'K' ? entries[0].check.records[0] : undefined;

  const findings: (Finding & { prefix?: string })[] = [...set.findings];
  if (versions.size > 1) findings.push({ severity: 'error', ref: 'K8', message: 'Die Codes dieses Bons gehören zu verschiedenen Fassungen' });
  if (mode === 'auto' && found?.version && found.version !== selected)
    findings.push({ severity: 'warning', message: `Code entspricht Fassung ${found.version}, oben gewählt ist ${selected}` });
  if (sameBonNr > 0)
    findings.push({
      severity: 'error',
      ref: 'K4',
      message: `BON_NR ${k?.[3]} kommt bei ${sameBonNr} weiteren gescannten Bon${sameBonNr > 1 ? 's' : ''} mit anderem Zeitpunkt oder Betrag vor – die Duplikatsprüfung würde sie zusammenwerfen`
    });
  for (const e of entries) {
    const nr = e.check.records[0]?.[1];
    const prefix = set.expected > 1 && nr ? `QR ${nr}` : undefined;
    e.check.findings.forEach((f) => findings.push({ ...f, prefix }));
    if (e.scanned.ecLevel && e.scanned.ecLevel !== 'Q')
      findings.push({ severity: 'warning', ref: 'V4', prefix, message: `Fehlerkorrektur ${e.scanned.ecLevel}, ${spec === '1.3' ? 'empfohlen' : 'verlangt'} ist Q` });
  }
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.length - errors;

  const all = entries.flatMap((e) => parseContent(e.scanned.text));
  const eRow = all.find((r) => r[0] === 'E');
  const mRows = all.filter((r) => r[0] === 'M');
  const pRows = all.filter((r) => r[0] === 'P');

  return (
    <section className="panel bon-card">
      <div className="bon-head">
        <h3>{k ? `Bon ${k[3]}` : 'Unbekannter Inhalt'}</h3>
        <StatusPill errors={errors} warnings={warnings} okText={set.complete ? 'Vollständig & konform' : 'Konform'} />
        {k && <span className="meta">{k[6]} € · {/^\d{10}$/.test(k[4]) ? formatEpoch(+k[4], true) + ' UTC' : k[4]}</span>}
        <span className="meta" title={specNote}>
          Spezifikation {spec} · {SPECS[spec].charsetLabel} · {specNote}
        </span>
        <div className="parts" aria-label="Teilcodes" style={{ marginLeft: 'auto' }}>
          {Array.from({ length: set.expected }, (_, i) => (
            <span key={i} className={set.present.includes(i + 1) ? 'have' : ''}>
              {i + 1}/{set.expected}
            </span>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Befunde</h3>
        <Findings items={findings} okText="Alle Codes vorhanden, alle Felder gültig, Summen stimmig." />
      </div>

      {(eRow || mRows.length > 0) && (
        <div className="section">
          <h3>Summen</h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>MwSt-Satz</th>
                  <th style={{ textAlign: 'right' }}>Brutto</th>
                  <th style={{ textAlign: 'right' }}>Netto</th>
                  <th style={{ textAlign: 'right' }}>MwSt</th>
                </tr>
              </thead>
              <tbody>
                {mRows.map((m, i) => (
                  <tr key={i}>
                    <td>{m[1]} %</td>
                    <td className="n">{m[2]}</td>
                    <td className="n">{m[3]}</td>
                    <td className="n">{m[4]}</td>
                  </tr>
                ))}
                {eRow && k && (
                  <tr>
                    <td>
                      <b>Gesamt (K7, E2, E3)</b>
                    </td>
                    <td className="n">
                      <b>{k[6]}</b>
                    </td>
                    <td className="n">
                      <b>{eRow[1]}</b>
                    </td>
                    <td className="n">
                      <b>{eRow[2]}</b>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {eRow && (
            <dl className="fields">
              {fieldSpecs(spec)
                .E.slice(2)
                .map((fs, i) => (
                  <Fragment key={fs.id}>
                    <dt>{fs.id}</dt>
                    <dd className="nm">{fs.name}</dd>
                    <dd>{eRow[3 + i] || '–'}</dd>
                  </Fragment>
                ))}
            </dl>
          )}
        </div>
      )}

      {pRows.length > 0 && (
        <div className="section">
          <h3>
            Positionen <small>{pRows.length}</small>
          </h3>
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Artikel</th>
                  <th style={{ textAlign: 'right' }}>Menge</th>
                  <th>Einheit</th>
                  <th style={{ textAlign: 'right' }}>MwSt</th>
                  <th>Erst.</th>
                  <th style={{ textAlign: 'right' }}>Brutto</th>
                </tr>
              </thead>
              <tbody>
                {pRows.map((p, i) => (
                  <tr key={i}>
                    <td style={{ overflowWrap: 'anywhere' }}>{p[6]}</td>
                    <td className="n">{p[4] || '–'}</td>
                    <td>{p[5] || 'Stück'}</td>
                    <td className="n">{p[1]} %</td>
                    <td>{p[2] === '0' ? 'nein' : 'ja'}</td>
                    <td className="n">{p[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="section">
        <h3>Rohinhalt</h3>
        <div className="seg">
          {entries.map((e, i) => (
            <button key={e.id} aria-selected={open === i} onClick={() => setOpen(open === i ? null : i)}>
              QR {e.check.records[0]?.[1] ?? '?'} · {e.check.bytes} Byte{e.scanned.detected && e.scanned.detected !== 'ascii' ? ` · ${e.scanned.detected === 'utf-8' ? 'UTF-8' : 'ISO 8859-1'}` : ''}{e.scanned.ecLevel ? ` · ECC ${e.scanned.ecLevel}` : ''}
              {e.scanned.version ? ` · V${e.scanned.version}` : ''} · {e.scanned.source}
            </button>
          ))}
        </div>
        {open !== null && entries[open] && <CsvView text={entries[open].scanned.text} />}
      </div>
    </section>
  );
}
