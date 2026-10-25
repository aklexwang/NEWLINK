import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger } from '@/components/admin/ui/tabs';
import { AdminRewardSettingsPanel } from './AdminRewardSettingsPanel';
import { PendingApproveTab } from './pending/PendingApproveTab';
import { PendingLedgerTab } from './pending/PendingLedgerTab';
import { PendingPayoutTab } from './pending/PendingPayoutTab';

const TABS = [
  { value: 'pending', label: '승인 대기' },
  { value: 'payout', label: '지급' },
  { value: 'ledger', label: '지급 이력' },
  { value: 'settings', label: '수단·설정' },
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
      <Tabs
        className="mt-6"
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          next.set('tab', value);
          setParams(next, { replace: true });
        }}
      >
        <TabsList className="flex-wrap">
          {TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="mt-6">
        {tab === 'pending' && <PendingApproveTab />}
        {tab === 'payout' && <PendingPayoutTab />}
        {tab === 'ledger' && <PendingLedgerTab />}
        {tab === 'settings' && <AdminRewardSettingsPanel />}
      </div>
    </div>
  );
}
