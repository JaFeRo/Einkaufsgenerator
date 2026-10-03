import { matrixPath, type QrMatrix } from '../qr/encode';

export function QrSvg({ matrix, label }: { matrix: QrMatrix; label: string }) {
  const quiet = 4;
  const dim = matrix.size + quiet * 2;
  return (
    <svg viewBox={`0 0 ${dim} ${dim}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect width={dim} height={dim} fill="#fff" />
      <path d={matrixPath(matrix, quiet)} fill="#000" />
    </svg>
  );
}
