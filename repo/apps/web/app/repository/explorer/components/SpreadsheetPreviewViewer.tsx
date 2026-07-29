'use client';

import { useEffect, useMemo, useState, type RefObject } from 'react';
import styles from '../RepositoryExplorer.module.css';
import type { ViewerControls } from './DocumentViewerToolbar';

type Props = {
  previewUrl: string;
  fileName: string;
  controls: ViewerControls;
  viewerRef?: RefObject<HTMLDivElement | null>;
};

type SheetData = {
  name: string;
  rows: string[][];
};

export function SpreadsheetPreviewViewer({
  previewUrl,
  fileName,
  controls,
  viewerRef,
}: Props) {
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const zoom = typeof controls.zoom === 'number' ? controls.zoom / 100 : 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSheets([]);
    setActiveSheet(0);

    (async () => {
      try {
        const response = await fetch(previewUrl);
        if (!response.ok) throw new Error('Spreadsheet could not be loaded.');
        const buffer = await response.arrayBuffer();
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'array' });
        const parsed: SheetData[] = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
            header: 1,
            raw: false,
            defval: '',
          }) as string[][];
          return { name, rows };
        });
        if (!cancelled) {
          setSheets(parsed);
          setLoading(false);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Spreadsheet preview failed.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewUrl]);

  const current = sheets[activeSheet];
  const maxCols = useMemo(() => {
    if (!current?.rows.length) return 0;
    return current.rows.reduce((max, row) => Math.max(max, row.length), 0);
  }, [current]);

  if (loading) {
    return (
      <div className={styles.previewLoading} aria-busy="true">
        Rendering spreadsheet…
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.previewUnavailable}>
        <span>{error}</span>
      </div>
    );
  }

  if (!current) {
    return (
      <div className={styles.previewUnavailable}>
        <span>Spreadsheet has no sheets to preview.</span>
      </div>
    );
  }

  return (
    <div className={styles.previewCanvas} ref={viewerRef}>
      {sheets.length > 1 ? (
        <div className={styles.sheetTabs} role="tablist" aria-label="Workbook sheets">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              type="button"
              role="tab"
              aria-selected={index === activeSheet}
              className={index === activeSheet ? styles.sheetTabActive : styles.sheetTab}
              onClick={() => setActiveSheet(index)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={styles.spreadsheetStage}
        style={{
          transform: `rotate(${controls.rotate}deg) scale(${zoom})`,
          transformOrigin: 'top left',
        }}
        aria-label={`Preview of ${fileName}`}
      >
        <table className={styles.spreadsheetTable}>
          <tbody>
            {current.rows.map((row, rowIndex) => (
              <tr key={`r-${rowIndex}`}>
                {Array.from({ length: maxCols }, (_, colIndex) => (
                  <td key={`c-${rowIndex}-${colIndex}`}>{row[colIndex] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
