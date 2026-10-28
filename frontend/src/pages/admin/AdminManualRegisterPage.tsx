import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { COLLECTOR_CHANNEL } from '../../utils/keywordFinder';
import { AdminLinkInspectBulk } from './AdminLinkInspectBulk';
import { AdminLinkRegisterPage } from './AdminLinkRegisterPage';

type RegisterTab = 'single' | 'bulk';

/** 관리자가 텔레그램 링크를 직접 찾아 등록하는 통합 메뉴 */
export function AdminManualRegisterPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<RegisterTab>(searchParams.get('tab') === 'bulk' ? 'bulk' : 'single');

  // 수집기에서 [대량 등록으로 보내기] 를 누르면 대량 탭으로 바꾼다 (목록은 대량 화면이 받음)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const d = event.data as { type?: string } | null;
      if (d?.type === COLLECTOR_CHANNEL) setTab('bulk');
    };
    window.addEventListener('message', onMessage);
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel(COLLECTOR_CHANNEL);
      ch.onmessage = () => setTab('bulk');
    } catch {
      ch = null;
    }
    return () => {
      window.removeEventListener('message', onMessage);
      ch?.close();
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-background px-6 pt-5">
        <div className="mb-5 grid max-w-5xl grid-cols-3 gap-3">
          {(
            [
              { id: 'single', label: '🔗 단건', desc: '링크 하나 바로 등록' },
              { id: 'bulk', label: '📦 대량', desc: '여러 링크 한꺼번에 검사·등록' },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
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
          <button
            type="button"
            onClick={() => {
              const w = window.open('/admin/collector', 'nl-collector', 'width=820,height=940');
              w?.focus();
            }}
            className="rounded-2xl bg-card px-5 py-4 text-left text-foreground shadow-[var(--hz-shadow)] ring-2 ring-emerald-500/40 transition-colors hover:bg-muted"
          >
            <p className="text-[17px] font-bold">🧲 수집기 ↗</p>
            <p className="mt-1 text-sm text-subtle">새 창에서 텍스트 속 아이디 찾기</p>
          </button>
        </div>
      </div>

      {tab === 'bulk' ? <AdminLinkInspectBulk /> : <AdminLinkRegisterPage />}
    </div>
  );
}
