import { useState } from 'react';
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
  // 올린 아이콘 그림이 깨지면 이모지로 대신 보여 준다
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (iconUrl && failedUrl !== iconUrl) {
    return (
      <img
        src={resolveMediaUrl(iconUrl)}
        alt=""
        onError={() => setFailedUrl(iconUrl)}
        className={`${box} object-cover`}
      />
    );
  }

  return <span className={box}>{emoji || '📁'}</span>;
}
