import type { Channel } from '../types/channel';

interface RewardApprovedModalProps {
  item: Channel;
  onClose: () => void;
}

export function RewardApprovedModal({ item, onClose }: RewardApprovedModalProps) {
  const tonAmount = item.rewardTonAmount ?? 0;
  const usdAmount = item.rewardUsdAmount;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-6 py-6 text-center text-white">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-3xl">
            🎉
          </div>
          <h3 className="mt-3 text-lg font-bold">축하합니다</h3>
          <p className="mt-1 text-sm text-emerald-50">승인되었습니다.</p>
        </div>

        <div className="space-y-3 px-5 py-5">
          <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
            <p className="text-[11px] font-medium text-slate-500">제보한 곳</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{item.title}</p>
          </div>

          <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
            <p className="text-[11px] font-medium text-amber-800/80">지급받은 코인</p>
            <p className="mt-1 text-xl font-bold text-amber-900">
              {tonAmount} <span className="text-sm font-semibold">TON/Gram</span>
            </p>
            {usdAmount != null && usdAmount > 0 && (
              <p className="mt-1 text-xs text-amber-800/80">
                지급 시점 기준 약 ${usdAmount.toFixed(2)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
