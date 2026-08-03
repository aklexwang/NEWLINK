import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastTone = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmState {
  message: string;
  resolve: (ok: boolean) => void;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
  confirm: (message: string) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** 브라우저 alert/confirm 대신 사용 — origin(도메인)이 뜨지 않음 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 2800);
  }, []);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ message, resolve });
    });
  }, []);

  const value = useMemo(() => ({ showToast, confirm }), [showToast, confirm]);

  const toneClass = (tone: ToastTone) => {
    if (tone === 'success') return 'bg-emerald-800 text-white';
    if (tone === 'error') return 'bg-red-700 text-white';
    return 'bg-[#202124] text-white';
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${toneClass(toast.tone)}`}
            role="status"
          >
            {toast.message}
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <p className="whitespace-pre-wrap text-sm text-slate-800">{confirmState.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
              >
                취소
              </button>
              <button
                type="button"
                className="rounded-xl bg-[#2AABEE] px-4 py-2 text-sm font-medium text-white"
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/** Provider 밖/비 React 경로용 콜백 등록 */
let externalToast: ((message: string, tone?: ToastTone) => void) | null = null;

export function registerExternalToast(fn: typeof externalToast) {
  externalToast = fn;
}

export function toastMessage(message: string, tone: ToastTone = 'info') {
  if (externalToast) {
    externalToast(message, tone);
    return;
  }
  // 최후 수단도 alert 금지 (도메인 노출 방지) — 콘솔만
  console.info('[notify]', message);
}
