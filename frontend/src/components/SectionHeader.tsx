interface SectionHeaderProps {
  title: string;
  showChevron?: boolean;
  /** 제목 옆 개수 배지 */
  count?: number;
}

export function SectionHeader({ title, showChevron = true, count }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-1 px-4 pb-1 pt-4">
      <h2 className="text-[22px] font-bold tracking-tight text-tg-text">{title}</h2>
      {count != null && (
        <span className="ml-1 rounded-full bg-nl-accent/15 px-2.5 py-0.5 text-[13px] font-bold text-nl-accent">
          {count.toLocaleString('ko-KR')}개
        </span>
      )}
      {showChevron && <span className="text-lg text-tg-hint">›</span>}
    </div>
  );
}