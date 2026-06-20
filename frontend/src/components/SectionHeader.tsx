interface SectionHeaderProps {
  title: string;
  showChevron?: boolean;
}

export function SectionHeader({ title, showChevron = true }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-1 px-4 pb-1 pt-4">
      <h2 className="text-[22px] font-bold tracking-tight text-tg-text">{title}</h2>
      {showChevron && <span className="text-lg text-tg-hint">›</span>}
    </div>
  );
}