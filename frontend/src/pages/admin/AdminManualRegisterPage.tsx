import { useState } from 'react';
import { AdminLinkInspectBulk } from './AdminLinkInspectBulk';
import { AdminLinkRegisterPage } from './AdminLinkRegisterPage';

type RegisterTab = 'single' | 'bulk';

/** 관리자가 텔레그램 링크를 직접 찾아 등록하는 통합 메뉴 */
export function AdminManualRegisterPage() {
  const [tab, setTab] = useState<RegisterTab>('single');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-background px-6 pt-5">
        <div className="mb-4 inline-flex rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setTab('single')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === 'single'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            단건
          </button>
          <button
            type="button"
            onClick={() => setTab('bulk')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === 'bulk'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            대량
          </button>
        </div>
      </div>

      {tab === 'bulk' ? <AdminLinkInspectBulk /> : <AdminLinkRegisterPage />}
    </div>
  );
}
