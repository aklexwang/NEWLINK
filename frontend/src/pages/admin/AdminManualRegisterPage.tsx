import { useState } from 'react';
import type { LinkType } from '../../types/channel';
import { AdminLinkRegisterPage } from './AdminLinkRegisterPage';

/** 관리자가 텔레그램 링크를 직접 찾아 등록하는 통합 메뉴 */
export function AdminManualRegisterPage() {
  const [linkType, setLinkType] = useState<LinkType>('channel');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-black/5 bg-white px-6 pt-5">
        <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setLinkType('channel')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              linkType === 'channel' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            채널
          </button>
          <button
            type="button"
            onClick={() => setLinkType('group')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              linkType === 'group' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            그룹
          </button>
        </div>
      </div>

      {linkType === 'channel' ? (
        <AdminLinkRegisterPage
          key="channel"
          linkType="channel"
          title="링크 등록 · 채널"
          subtitle="텔레그램 채널 링크를 찾아 바로 등록합니다."
          itemLabel="채널"
          managePath="/admin/channels"
          placeholder="https://t.me/채널명 또는 @username"
        />
      ) : (
        <AdminLinkRegisterPage
          key="group"
          linkType="group"
          title="링크 등록 · 그룹"
          subtitle="텔레그램 그룹 링크를 찾아 바로 등록합니다."
          itemLabel="그룹"
          managePath="/admin/groups"
          placeholder="https://t.me/+초대코드 또는 그룹 링크"
        />
      )}
    </div>
  );
}
