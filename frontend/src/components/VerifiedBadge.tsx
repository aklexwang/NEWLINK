interface VerifiedBadgeProps {
  size?: 'sm' | 'md';
}

export function VerifiedBadge({ size = 'md' }: VerifiedBadgeProps) {
  const compact = size === 'sm';
  return (
    <span
      title="운영자가 인증한 채널"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-50 font-semibold text-sky-700 ring-1 ring-sky-200 ${
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'
      }`}
    >
      ✓ 인증
    </span>
  );
}
