import { marked } from 'marked';
import { useMemo } from 'react';
// Eine einzige Quelle: dieselbe Datei liegt in docs/ und wird hier angezeigt.
import source from '../../docs/RUECKFRAGEN-SCHNITTSTELLE.md?raw';

/** Rendert den eigenen, mitgelieferten Markdown-Text. Eingaben von außen gibt es nicht. */
export function Questions({ notify }: { notify: (m: string) => void }) {
  const html = useMemo(
    () => (marked.parse(source, { async: false, gfm: true }) as string).replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div>'),
    []
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      notify('Nachricht als Text kopiert');
    } catch {
      notify('Kopieren nicht möglich – Text bitte markieren');
    }
  };

  return (
    <section className="panel doc-panel">
      <div className="doc-bar no-print">
        <p className="hint">Entwurf einer Nachricht an den Autor der Schnittstellendefinition. Den Namen unten vor dem Versenden ergänzen.</p>
        <button className="btn" onClick={copy}>
          Als Text kopieren
        </button>
      </div>
      <article className="doc" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
