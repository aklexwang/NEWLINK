import type { ChannelGrade } from '../types/stats';

const GRADE_CLASS: Record<ChannelGrade, string> = {
  S: 'bg-amber-100 text-amber-800 ring-amber-200',
  A: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  B: 'bg-sky-100 text-sky-800 ring-sky-200',
  C: 'bg-orange-100 text-orange-800 ring-orange-200',
  D: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function GradeBadge({
  grade,
  size = 'md',
}: {
  grade: ChannelGrade | null;
  size?: 'sm' | 'md';
}) {
  if (!grade) return null;
  const box = size === 'sm' ? 'h-5 min-w-5 px-1 text-[11px]' : 'h-7 min-w-7 px-1.5 text-[13px]';
  return (
    <span className={`inline-flex items-center justify-center rounded-lg font-bold ring-1 ${box} ${GRADE_CLASS[grade]}`}>
      {grade}
    </span>
  );
}
