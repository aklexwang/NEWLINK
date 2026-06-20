interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  isLoading?: boolean;
}

export function SearchBar({ value, onChange, onSearch, isLoading }: SearchBarProps) {
  return (
    <div id="search-section" className="px-4 pb-2 pt-1">
      <div className="flex items-center gap-2 rounded-2xl border border-black/[0.06] bg-white px-3 py-2 shadow-sm">
        <span className="text-tg-hint">🔍</span>
        <input
          id="search-input"
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder="검색..."
          className="min-w-0 flex-1 bg-transparent text-[15px] text-tg-text outline-none placeholder:text-tg-hint"
        />
        {isLoading && <span className="text-xs text-tg-hint">...</span>}
      </div>
    </div>
  );
}