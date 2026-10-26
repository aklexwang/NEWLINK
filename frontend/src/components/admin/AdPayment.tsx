import { AdminDatePicker } from './AdminDatePicker';

const inputClass =
  'mt-1.5 h-11 w-full rounded-xl bg-background px-3.5 text-[15px] text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50';

/** 광고 입력칸: 받은 USDT + 받은 날짜 */
export function AdPaymentFields({
  usdt,
  onUsdt,
  paidOn,
  onPaidOn,
}: {
  usdt: string;
  onUsdt: (value: string) => void;
  paidOn: string;
  onPaidOn: (value: string) => void;
}) {
  return (
    <>
      <label className="block text-sm font-medium text-subtle">
        받은 광고비 (USDT)
        <div className="relative">
          <input
            value={usdt}
            onChange={(e) => onUsdt(e.target.value.replace(/[^\d.,]/g, ''))}
            inputMode="decimal"
            placeholder="예: 150"
            className={`${inputClass} pr-16`}
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 mt-[3px] -translate-y-1/2 text-sm font-bold text-emerald-600">
            USDT
          </span>
        </div>
      </label>
      <div className="text-sm font-medium text-subtle">
        받은 날짜
        <AdminDatePicker className="mt-1.5" value={paidOn} onChange={onPaidOn} placeholder="받은 날 선택" />
      </div>
    </>
  );
}

/** 목록 표시: 💵 150 USDT · 10월 26일 입금 / ⏰ 마감 D-2 */
export function AdPaymentChips({
  paidUsdt,
  paidOn,
  daysLeft,
  live,
}: {
  paidUsdt: number | null;
  paidOn: string | null;
  daysLeft: number | null;
  /** 노출 중이거나 예약된 광고만 마감 표시 */
  live: boolean;
}) {
  const on = paidOn ? paidOn.replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_, y, m, d) => `${y}.${m}.${d}`) : null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {paidUsdt != null ? (
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
          💵 {paidUsdt.toLocaleString()} USDT{on ? ` · ${on} 입금` : ''}
        </span>
      ) : (
        <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-600">💵 입금 미기록</span>
      )}
      {live && daysLeft != null && daysLeft >= 0 && daysLeft <= 3 && (
        <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700">
          ⏰ {daysLeft === 0 ? '오늘 마감' : `마감 D-${daysLeft}`}
        </span>
      )}
    </span>
  );
}
