interface NewLinkLogoProps {
  compact?: boolean;
}

export function NewLinkLogo({ compact = false }: NewLinkLogoProps) {
  const height = compact ? 28 : 76;

  return (
    <span className={`inline-flex ${compact ? 'items-center' : 'flex-col items-center pb-2'}`}>
      <span className="m-0 leading-none">
        <img
          src="/assets/newlink-logo.png"
          alt="NEW LINK"
          draggable={false}
          className={`logo-image block w-auto select-none ${compact ? 'max-w-[118px]' : 'max-w-[min(100%,520px)]'}`}
          style={{ height }}
        />
      </span>
    </span>
  );
}
