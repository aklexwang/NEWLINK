import { useEffect, useRef, useState } from 'react';
import { WEEK, addDays, addMonths, formatYmdKo, parseYmd, toYmd, todayKstYmd } from '../../utils/ymd';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 이 날짜보다 앞은 고를 수 없음 (예: 종료일 ≥ 시작일) */
  min?: string;
  /** 비우기 버튼 표시 */
  clearable?: boolean;
  /** 빠른 선택 기준일(+1주·+1개월 계산용). 없으면 오늘 */
  quickBase?: string;
  className?: string;
};

/**
 * 어드민 날짜 고르기: 버튼을 누르면 달력이 펼쳐지고 날짜를 눌러 고른다.
 * (포털을 쓰지 않음 — .admin-root 테마 밖으로 나가지 않게)
 */
export function AdminDatePicker({
  value,
  onChange,
  placeholder = '날짜 선택',
  min,
  clearable = true,
  quickBase,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const today = todayKstYmd();
  const initial = parseYmd(value) ?? parseYmd(min ?? '') ?? parseYmd(today)!;
  const [view, setView] = useState({ y: initial.y, m: initial.m });
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      // 열 때 고른 날짜(없으면 시작 가능일·오늘)의 달을 보여준다
      const p = parseYmd(value) ?? parseYmd(min ?? '') ?? parseYmd(today)!;
      setView({ y: p.y, m: p.m });
    }
    setOpen(!open);
  };

  const pick = (ymd: string) => {
    onChange(ymd);
    setOpen(false);
  };

  const firstDow = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(Date.UTC(v.y, v.m + delta, 1));
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    });

  const base = quickBase && parseYmd(quickBase) ? quickBase : today;
  const quick: { label: string; ymd: string }[] = [
    { label: '오늘', ymd: today },
    { label: '+1주', ymd: addDays(base, 7) },
    { label: '+1개월', ymd: addMonths(base, 1) },
    { label: '+3개월', ymd: addMonths(base, 3) },
  ];

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`flex h-11 w-full items-center gap-2.5 rounded-xl bg-background px-3.5 text-left text-[15px] ring-1 outline-none ${
          open ? 'ring-2 ring-primary/50' : 'ring-border'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-subtle" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className={value ? 'text-foreground' : 'text-muted-foreground'}>
          {value ? formatYmdKo(value) : placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[320px] rounded-2xl bg-card p-4 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-border">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="이전 달" className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-foreground hover:bg-muted">
              ‹
            </button>
            <p className="text-[16px] font-bold text-foreground">
              {view.y}년 {view.m + 1}월
            </p>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="다음 달" className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-foreground hover:bg-muted">
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEK.map((w, i) => (
              <span key={w} className={`pb-1 text-xs font-semibold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-sky-400' : 'text-subtle'}`}>
                {w}
              </span>
            ))}
            {cells.map((day, index) => {
              if (day == null) return <span key={`e${index}`} />;
              const ymd = toYmd(view.y, view.m, day);
              const selected = ymd === value;
              const isToday = ymd === today;
              const disabled = Boolean(min && ymd < min);
              const dow = index % 7;
              return (
                <button
                  key={ymd}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(ymd)}
                  className={`h-9 rounded-lg text-[14px] tabular-nums transition-colors ${
                    selected
                      ? 'bg-primary font-bold text-white'
                      : disabled
                        ? 'cursor-not-allowed text-muted-foreground/40'
                        : `hover:bg-muted ${isToday ? 'font-bold ring-1 ring-primary' : ''} ${
                            dow === 0 ? 'text-red-400' : dow === 6 ? 'text-sky-400' : 'text-foreground'
                          }`
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={Boolean(min && q.ymd < min)}
                onClick={() => pick(q.ymd)}
                className="h-8 rounded-lg bg-muted px-2.5 text-[13px] font-semibold text-foreground hover:bg-primary/20 disabled:opacity-40"
              >
                {q.label}
              </button>
            ))}
            {clearable && value && (
              <button type="button" onClick={() => pick('')} className="ml-auto h-8 rounded-lg px-2.5 text-[13px] font-semibold text-destructive hover:bg-destructive/10">
                지우기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
