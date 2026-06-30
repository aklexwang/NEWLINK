import { useState } from 'react';

interface WalletRegisterModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (wallet: string) => Promise<void>;
  submitLabel?: string;
}

export function WalletRegisterModal({ open, onClose, onSubmit, submitLabel = '등록 후 제보' }: WalletRegisterModalProps) {
  const [wallet, setWallet] = useState('');
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = wallet.trim();
    if (!address) return;
    setSaving(true);
    try {
      await onSubmit(address);
      setWallet('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/45 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-black/5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-900">TON 지갑 등록</h3>
        <p className="mt-2 text-sm text-slate-600">
          제보 보상을 받을 TON 지갑 주소를 입력해 주세요. 최초 1회만 등록하면 됩니다.
        </p>
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="테스트용 아무 주소 입력"
          className="mt-4 w-full rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-slate-200 focus:ring-blue-300"
          autoFocus
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving || !wallet.trim()}
            className="rounded-xl bg-blue-600 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '등록 중...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
