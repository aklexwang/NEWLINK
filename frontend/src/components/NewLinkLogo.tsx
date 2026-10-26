interface NewLinkLogoProps {
  compact?: boolean;
}

/** 서로 걸린 두 고리 — "링크(연결)"를 뜻하는 로고 */
function LinkMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="tl-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12b884" />
          <stop offset="1" stopColor="#2aabee" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#tl-grad)" strokeWidth="3.4" strokeLinecap="round">
        <rect x="2.5" y="15.5" width="17" height="10" rx="5" transform="rotate(-45 11 20.5)" />
        <rect x="12.5" y="6.5" width="17" height="10" rx="5" transform="rotate(-45 21 11.5)" />
      </g>
    </svg>
  );
}

/** 회원 화면 로고: "TellLink" 글씨 + 링크 고리 */
export function NewLinkLogo({ compact = false }: NewLinkLogoProps) {
  const fontSize = compact ? 24 : 44;
  return (
    <span className="inline-flex items-center gap-1.5 select-none" aria-label="TellLink">
      <span
        className="leading-none tracking-tight"
        style={{ fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize }}
      >
        <span className="text-nl-text">Tell</span>
        <span className="text-nl-accent">Link</span>
      </span>
      <LinkMark size={Math.round(fontSize * 1.25)} />
    </span>
  );
}
