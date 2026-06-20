import { resolveMediaUrl } from '../utils/mediaUrl';

interface CategoryIconProps {
  emoji: string;
  iconUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClass = {
  sm: 'h-5 w-5 text-base rounded-md',
  md: 'h-10 w-10 text-2xl rounded-[14px]',
  lg: 'h-12 w-12 text-2xl rounded-[14px]',
};

export function CategoryIcon({ emoji, iconUrl, size = 'md', className = '' }: CategoryIconProps) {
  const box = `${sizeClass[size]} shrink-0 flex items-center justify-center overflow-hidden bg-tg-secondary ${className}`;

  if (iconUrl) {
    return <img src={resolveMediaUrl(iconUrl)} alt="" className={`${box} object-cover`} />;
  }

  return <span className={box}>{emoji || '📁'}</span>;
}