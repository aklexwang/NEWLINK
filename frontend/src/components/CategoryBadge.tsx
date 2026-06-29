import { CategoryIcon } from './CategoryIcon';

interface CategoryBadgeProps {
  name: string;
  emoji?: string;
  iconUrl?: string | null;
  className?: string;
}

export function CategoryBadge({
  name,
  emoji = '📁',
  iconUrl,
  className = '',
}: CategoryBadgeProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full bg-tg-secondary px-2 py-0.5 text-[11px] font-medium text-tg-text ${className}`}
    >
      <CategoryIcon emoji={emoji} iconUrl={iconUrl} size="sm" className="!h-4 !w-4 !text-xs" />
      <span className="truncate">{name}</span>
    </span>
  );
}
