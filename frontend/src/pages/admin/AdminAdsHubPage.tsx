import { useSearchParams } from 'react-router-dom';
import { AdminBannerAdsPage } from './AdminBannerAdsPage';
import { AdminRankAdsPage } from './AdminRankAdsPage';

const TABS = [
  { id: 'banner', label: '🖼️ 배너 광고', desc: '회원 홈 맨 위 슬라이드 배너' },
  { id: 'rooms', label: '📢 텔레그램방 광고', desc: '카테고리 목록 1~5위 자리' },
] as const;

/** 어드민 > 광고 관리: 배너 광고 / 텔레그램방 광고 */
export function AdminAdsHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'rooms' ? 'rooms' : 'banner';

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setParams(item.id === 'banner' ? {} : { tab: item.id }, { replace: true })}
              className={`rounded-2xl px-6 py-5 text-left shadow-[var(--hz-shadow)] transition-colors ${
                active ? 'bg-primary text-white' : 'bg-card text-foreground hover:bg-muted'
              }`}
            >
              <p className="text-lg font-bold">{item.label}</p>
              <p className={`mt-1 text-sm ${active ? 'text-white/80' : 'text-subtle'}`}>{item.desc}</p>
            </button>
          );
        })}
      </div>
      {tab === 'banner' ? <AdminBannerAdsPage /> : <AdminRankAdsPage />}
    </div>
  );
}
