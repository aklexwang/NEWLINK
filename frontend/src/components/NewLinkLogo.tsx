interface NewLinkLogoProps {
  compact?: boolean;
}

export function NewLinkLogo({ compact = false }: NewLinkLogoProps) {
  const height = compact ? 34 : 76;

  return (
    <header className={`flex flex-col items-center ${compact ? 'pb-2' : ''}`}>
      <h1 className="m-0 leading-none">
        <img
          src="/assets/newlink-logo.png"
          alt="NEW LINK"
          draggable={false}
          className="logo-image block w-auto max-w-[min(100%,520px)] select-none"
          style={{ height }}
        />
      </h1>
    </header>
  );
}
