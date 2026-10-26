import { useSearchParams } from 'react-router-dom';
import { AdminRewardSettingsPanel } from './AdminRewardSettingsPanel';
import { AdminRewardSwitch } from '../../components/admin/AdminRewardSwitch';
import { PendingApproveTab } from './pending/PendingApproveTab';
import { PendingLedgerTab } from './pending/PendingLedgerTab';
import { PendingPayoutTab } from './pending/PendingPayoutTab';

const TABS = [
  { value: 'pending', label: '📝 승인 대기', desc: '새 제보 확인·승인' },
  { value: 'payout', label: '💸 지급', desc: '보상 보내기' },
  { value: 'ledger', label: '📒 지급 이력', desc: '보낸 기록 보기' },
  { value: 'settings', label: '⚙️ 지급 수단', desc: '지갑·금액 설정' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

function parseTab(value: string | null): TabValue {
  if (value === 'payout' || value === 'ledger' || value === 'settings') return value;
  return 'pending';
}

export function AdminPendingPage() {
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <p className="mt-1 text-sm text-muted-foreground">
        승인·지급·이력을 한 화면에서 처리합니다. 새 제보 알림은 그대로 동작합니다.
      </p>
      <div className="mt-6">
        <AdminRewardSwitch />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TABS.map((item) => {
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('tab', item.value);
                setParams(next, { replace: true });
              }}
              aria-pressed={active}
              className={`rounded-2xl px-5 py-4 text-left shadow-[var(--hz-shadow)] transition-colors ${
                active ? 'bg-primary text-white' : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              <p className="text-[17px] font-bold">{item.label}</p>
              <p className={`mt-1 text-sm ${active ? 'text-white/80' : 'text-subtle'}`}>{item.desc}</p>
            </button>
          );
        })}
      </div>
      <div className="mt-6">
        {tab === 'pending' && <PendingApproveTab />}
        {tab === 'payout' && <PendingPayoutTab />}
        {tab === 'ledger' && <PendingLedgerTab />}
        {tab === 'settings' && <AdminRewardSettingsPanel />}
      </div>
    </div>
  );
}
