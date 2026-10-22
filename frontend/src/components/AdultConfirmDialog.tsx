const STORAGE_KEY = 'newlink-adult-confirmed';

export function hasConfirmedAdult(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberAdultConfirm() {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function AdultConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-tg-bg p-5 shadow-xl">
        <p className="text-[17px] font-bold text-tg-text">만 19세 이상만 이용할 수 있습니다</p>
        <p className="mt-2 text-[13px] leading-snug text-tg-hint">
          성인 카테고리에는 성인 콘텐츠가 포함될 수 있습니다. 만 19세 이상이면 확인을 눌러 주세요.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-tg-secondary py-2 text-[13px] font-semibold text-tg-text"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => {
              rememberAdultConfirm();
              onConfirm();
            }}
            className="flex-1 rounded-xl bg-tg-open-bg py-2 text-[13px] font-semibold text-tg-open-text"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
