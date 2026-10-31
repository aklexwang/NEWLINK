interface NewLinkLogoProps {
  compact?: boolean;
}

/** 회원 화면 로고: "TellLink" 글씨 (Link 는 텔레그램 파랑) */
export function NewLinkLogo({ compact = false }: NewLinkLogoProps) {
  const fontSize = compact ? 22 : 40;
  return (
    <span
      className="inline-flex items-center leading-none select-none"
      aria-label="TellLink"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif", fontWeight: 800, fontSize, letterSpacing: '-0.02em' }}
    >
      <span className="text-nl-text">Tell</span>
      <span className="text-[#2aabee]">Link</span>
    </span>
  );
}
