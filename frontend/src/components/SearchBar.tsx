interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  isLoading?: boolean;
  variant?: 'default' | 'google';
  className?: string;
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  );
}

export function SearchBar({
  value,
  onChange,
  onSearch,
  isLoading,
  variant = 'default',
  className = '',
}: SearchBarProps) {
  if (variant === 'google') {
    return (
      <div id="search-section" className={`w-full max-w-[520px] ${className}`}>
        <div className="flex h-[46px] items-center gap-1 rounded-full border border-[#dfe1e5] bg-white px-3 shadow-[0_1px_6px_rgba(32,33,36,0.16)] transition-shadow hover:shadow-[0_1px_8px_rgba(32,33,36,0.24)] focus-within:border-transparent focus-within:shadow-[0_1px_8px_rgba(32,33,36,0.28)]">
          <input
            id="search-input"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            placeholder="채널 검색"
            className="min-w-0 flex-1 bg-transparent px-1 text-[16px] text-[#202124] outline-none placeholder:text-[#9aa0a6]"
          />
          {value && !isLoading && (
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="검색어 지우기"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#70757a] hover:bg-[#f1f3f4]"
            >
              ✕
            </button>
          )}
          {isLoading ? (
            <span className="shrink-0 px-2 text-xs text-tg-hint">...</span>
          ) : (
            <button
              type="button"
              onClick={onSearch}
              aria-label="검색 시작"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
            >
              <SearchIcon className="h-5 w-5 fill-[#4285f4]" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div id="search-section" className={`px-4 pb-2 pt-1 ${className}`}>
      <div className="flex items-center gap-1 rounded-2xl border border-black/[0.06] bg-white px-2 py-2 shadow-sm">
        <input
          id="search-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          placeholder="채널 검색"
          className="min-w-0 flex-1 bg-transparent px-1 text-[15px] text-tg-text outline-none placeholder:text-tg-hint"
        />
        {value && !isLoading && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="검색어 지우기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-tg-hint hover:bg-black/[0.04]"
          >
            ✕
          </button>
        )}
        {isLoading ? (
          <span className="shrink-0 px-2 text-xs text-tg-hint">...</span>
        ) : (
          <button
            type="button"
            onClick={onSearch}
            aria-label="검색 시작"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.04]"
          >
            <SearchIcon className="h-5 w-5 fill-tg-link" />
          </button>
        )}
      </div>
    </div>
  );
}
