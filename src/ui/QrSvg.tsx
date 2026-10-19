import type { CSSProperties } from 'react';
import { QUIET_MODULES } from '../qr/layout';
import { matrixPath, type QrMatrix } from '../qr/encode';

export function QrSvg({ matrix, label, style }: { matrix: QrMatrix; label: string; style?: CSSProperties }) {
  const dim = matrix.size + QUIET_MODULES * 2;
  return (
    <svg viewBox={`0 0 ${dim} ${dim}`} shapeRendering="crispEdges" role="img" aria-label={label} style={style}>
      <rect width={dim} height={dim} fill="#fff" />
      <path d={matrixPath(matrix, QUIET_MODULES)} fill="#000" />
    </svg>
  );
}
