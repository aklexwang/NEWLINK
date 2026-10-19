interface SparklineProps {
  values: (number | null | undefined)[];
  className?: string;
}

export function Sparkline({ values, className = '' }: SparklineProps) {
  const points = values
    .map((value, index) => (value == null || !Number.isFinite(value) ? null : { index, value }))
    .filter((p): p is { index: number; value: number } => p != null);

  if (points.length < 2) {
    return <span className={`inline-block w-14 text-center text-[10px] text-tg-hint ${className}`}>—</span>;
  }

  const width = 56;
  const height = 20;
  const pad = 1;
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const span = max - min || 1;
  const last = values.length - 1 || 1;
  const coords = points.map((p) => {
    const x = pad + (p.index / last) * (width - pad * 2);
    const y = height - pad - ((p.value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = points[points.length - 1].value >= points[0].value;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`h-5 w-14 shrink-0 ${className}`}
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={up ? '#059669' : '#dc2626'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={coords.join(' ')}
      />
    </svg>
  );
}
