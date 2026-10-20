import { useTheme } from '../providers/ThemeProvider';

interface NewLinkLogoProps {
  compact?: boolean;
}

export function NewLinkLogo({ compact = false }: NewLinkLogoProps) {
  const { theme } = useTheme();
  const height = compact ? 28 : 76;
  const src =
    theme === 'light' ? '/assets/newlink-logo.png' : '/assets/newlink-logo-dark.png';

  return (
    <span className={`inline-flex ${compact ? 'items-center' : 'flex-col items-center pb-2'}`}>
      <span
        className={`inline-flex overflow-hidden bg-white leading-none ${
          compact ? 'rounded-lg' : 'rounded-2xl'
        }`}
      >
        <img
          src={src}
          alt="NEW LINK"
          draggable={false}
          className={`logo-image block w-auto select-none ${compact ? 'max-w-[118px]' : 'max-w-[min(100%,520px)]'}`}
          style={{ height }}
        />
      </span>
    </span>
  );
}
