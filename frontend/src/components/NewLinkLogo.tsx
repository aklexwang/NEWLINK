interface NewLinkLogoProps {
  compact?: boolean;
}

/** 텔레그램 파란 둥근 네모 안에 서로 걸린 두 고리 — "텔레그램 + 링크" */
function LinkMark({ size }: { size: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center bg-[#2aabee] shadow-[0_2px_10px_rgba(42,171,238,0.35)]"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
      aria-hidden
    >
      <svg width={Math.round(size * 0.66)} height={Math.round(size * 0.66)} viewBox="0 0 24 24" fill="none">
        <path
          d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.3 1.3"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** 회원 화면 로고: 파란 고리 마크 + "TellLink" (Link 는 텔레그램 파랑) */
export function NewLinkLogo({ compact = false }: NewLinkLogoProps) {
  const fontSize = compact ? 21 : 40;
  return (
    <span className="inline-flex items-center gap-2 select-none" aria-label="TellLink">
      <LinkMark size={Math.round(fontSize * 1.3)} />
      <span
        className="leading-none"
        style={{ fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize, letterSpacing: '-0.02em' }}
      >
        <span className="text-nl-text">Tell</span>
        <span className="text-[#2aabee]">Link</span>
      </span>
    </span>
  );
}
