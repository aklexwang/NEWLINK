import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  getAdminChannels,
  getPromotedChannels,
  promoteChannel,
  updateAdminChannel,
} from '../../api/admin';
import { AdClientCells, AdClientDetail } from '../../components/admin/AdClientInfo';
import {
  AdminEmptyState,
  AdminMessage,
  AdminTable,
  AdminTableShell,
  AdminTd,
  AdminTh,
  ChannelAvatar,
} from '../../components/admin/AdminTable';
import type { Channel, LinkType } from '../../types/channel';
import { LinkTypeToggle } from '../../components/admin/LinkTypeToggle';
import {
  dateInputToPromotedUntil,
  defaultPromoteDateInput,
  formatPromotedUntil,
  isPromotionActive,
  toDateInputValue,
} from '../../utils/promotion';

export function AdminAdsManagePage() {
  const [promoted, setPromoted] = useState<Channel[]>([]);
  const [candidates, setCandidates] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [candidateQuery, setCandidateQuery] = useState('');
  const [promoteDates, setPromoteDates] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);

  const syncPromoteDates = (items: Channel[]) => {
    setPromoteDates((prev) => {
      const next = { ...prev };
      for (const item of items) {
        if (next[item.id] === undefined) {
          next[item.id] = toDateInputValue(item.promotedUntil) || defaultPromoteDateInput();
        }
      }
      return next;
    });
  };

  const loadPromoted = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getPromotedChannels(query.trim() || undefined);
      setPromoted(items);
      syncPromoteDates(items);
      setMessage('');
    } catch {
      setMessage('광고 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    loadPromoted();
  }, [loadPromoted]);

  const searchCandidates = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchLoading(true);
    try {
      const items = await getAdminChannels({ status: 'active', q: candidateQuery.trim() || undefined });
      setCandidates(items);
      syncPromoteDates(items);
      setShowAddSection(true);
    } catch {
      setMessage('채널 검색에 실패했습니다.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleApply = async (id: string) => {
    const date = promoteDates[id];
    if (!date) {
      setMessage('노출 종료일을 입력해 주세요.');
      return;
    }
    try {
      await promoteChannel(id, dateInputToPromotedUntil(date));
      setMessage('광고 노출이 적용되었습니다.');
      await loadPromoted();
      setCandidates((prev) => prev.filter((item) => item.id !== id));
    } catch {
      setMessage('광고 적용에 실패했습니다.');
    }
  };

  const handleRemove = async (channel: Channel) => {
    try {
      await updateAdminChannel(channel.id, { isPromoted: false, promotedUntil: null });
      setMessage('광고 노출을 해제했습니다.');
      if (expandedId === channel.id) setExpandedId(null);
      await loadPromoted();
    } catch {
      setMessage('광고 해제에 실패했습니다.');
    }
  };

  const handleUpdateLinkType = async (id: string, linkType: LinkType) => {
    try {
      await updateAdminChannel(id, { linkType });
      setPromoted((prev) => prev.map((item) => (item.id === id ? { ...item, linkType } : item)));
      setCandidates((prev) => prev.map((item) => (item.id === id ? { ...item, linkType } : item)));
      setMessage('유형이 저장되었습니다.');
    } catch {
      setMessage('유형 저장에 실패했습니다.');
    }
  };

  const activeCount = promoted.filter((item) => isPromotionActive(item.isPromoted, item.promotedUntil)).length;
  const colCount = 7;

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">광고 관리</h2>
            <p className="mt-1 text-sm text-slate-500">노출 중 {activeCount}건 · 전체 {promoted.length}건</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddSection((v) => !v)}
            className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            {showAddSection ? '추가 패널 닫기' : '+ 광고 추가'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && <AdminMessage message={message} />}

        {showAddSection && (
          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">광고 추가</h3>
            <form onSubmit={searchCandidates} className="flex gap-2">
              <input
                value={candidateQuery}
                onChange={(e) => setCandidateQuery(e.target.value)}
                placeholder="승인된 채널/그룹 검색"
                className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-black/10 outline-none focus:ring-purple-300"
              />
              <button type="submit" disabled={searchLoading} className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {searchLoading ? '...' : '검색'}
              </button>
            </form>
            {candidates.length > 0 && (
              <AdminTableShell>
                <AdminTable>
                  <thead className="bg-slate-50">
                    <tr>
                      <AdminTh className="w-12" />
                      <AdminTh>제목</AdminTh>
                      <AdminTh className="w-16">유형</AdminTh>
                      <AdminTh className="w-28">종료일</AdminTh>
                      <AdminTh className="w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {candidates.map((channel) => (
                      <tr key={channel.id}>
                        <AdminTd><ChannelAvatar channel={channel} /></AdminTd>
                        <AdminTd>
                          <p className="max-w-[180px] truncate font-medium text-slate-900">{channel.title}</p>
                          {channel.isPromoted && <span className="text-[10px] text-purple-600">등록됨</span>}
                        </AdminTd>
                        <AdminTd>
                          <LinkTypeToggle
                            value={channel.linkType ?? 'channel'}
                            onChange={(type) => handleUpdateLinkType(channel.id, type)}
                          />
                        </AdminTd>
                        <AdminTd>
                          <input
                            type="date"
                            value={promoteDates[channel.id] ?? defaultPromoteDateInput()}
                            onChange={(e) => setPromoteDates((prev) => ({ ...prev, [channel.id]: e.target.value }))}
                            className="w-full rounded bg-white px-2 py-1 text-xs ring-1 ring-black/10"
                          />
                        </AdminTd>
                        <AdminTd>
                          <button type="button" onClick={() => handleApply(channel.id)} className="rounded-lg bg-purple-600 px-2.5 py-1 text-xs font-medium text-white">
                            {channel.isPromoted ? '변경' : '등록'}
                          </button>
                        </AdminTd>
                      </tr>
                    ))}
                  </tbody>
                </AdminTable>
              </AdminTableShell>
            )}
          </section>
        )}

        <div className="mb-3 flex justify-end">
          <form onSubmit={(e) => { e.preventDefault(); loadPromoted(); }} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="광고 검색"
              className="w-48 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10 outline-none focus:ring-purple-300"
            />
            <button type="submit" className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white">검색</button>
          </form>
        </div>

        {loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : promoted.length === 0 ? (
          <AdminEmptyState message="등록된 광고가 없습니다." />
        ) : (
          <AdminTableShell>
            <AdminTable>
              <thead className="bg-slate-50">
                <tr>
                  <AdminTh className="w-12" />
                  <AdminTh>제목</AdminTh>
                  <AdminTh className="w-16">유형</AdminTh>
                  <AdminTh className="w-20">노출</AdminTh>
                  <AdminTh className="w-24">종료일</AdminTh>
                  <AdminTh className="min-w-[100px]">의뢰 · TON</AdminTh>
                  <AdminTh className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {promoted.map((channel) => {
                  const active = isPromotionActive(channel.isPromoted, channel.promotedUntil);
                  const expanded = expandedId === channel.id;
                  return (
                    <Fragment key={channel.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : channel.id)}
                        className={`cursor-pointer transition hover:bg-slate-50/80 ${expanded ? 'bg-purple-50/40' : ''}`}
                      >
                        <AdminTd><ChannelAvatar channel={channel} /></AdminTd>
                        <AdminTd>
                          <p className="max-w-[180px] truncate font-medium text-slate-900">{channel.title}</p>
                          <p className="truncate text-[11px] text-slate-500">{channel.category}</p>
                        </AdminTd>
                        <AdminTd>
                          <LinkTypeToggle
                            value={channel.linkType ?? 'channel'}
                            onChange={(type) => handleUpdateLinkType(channel.id, type)}
                          />
                        </AdminTd>
                        <AdminTd>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${active ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500'}`}>
                            {active ? '노출' : '만료'}
                          </span>
                        </AdminTd>
                        <AdminTd>
                          <span className="text-xs tabular-nums text-slate-600">
                            {channel.promotedUntil ? formatPromotedUntil(channel.promotedUntil) : '-'}
                          </span>
                        </AdminTd>
                        <AdminTd><AdClientCells channel={channel} /></AdminTd>
                        <AdminTd><span className={`text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}>▼</span></AdminTd>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/60">
                          <AdminTd colSpan={colCount}>
                            <div className="space-y-3 py-1" onClick={(e) => e.stopPropagation()}>
                              <a href={channel.link} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-blue-600 hover:underline">
                                {channel.link}
                              </a>
                              <AdClientDetail channel={channel} />
                              <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-slate-500">유형</span>
                                  <LinkTypeToggle
                                    value={channel.linkType ?? 'channel'}
                                    onChange={(type) => handleUpdateLinkType(channel.id, type)}
                                  />
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="date"
                                  value={promoteDates[channel.id] ?? ''}
                                  onChange={(e) => setPromoteDates((prev) => ({ ...prev, [channel.id]: e.target.value }))}
                                  className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-black/10"
                                />
                                <button type="button" onClick={() => handleApply(channel.id)} className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-medium text-amber-950">
                                  기간 수정
                                </button>
                                <button type="button" onClick={() => handleRemove(channel)} className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-black/10">
                                  노출 해제
                                </button>
                              </div>
                            </div>
                          </AdminTd>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </AdminTable>
          </AdminTableShell>
        )}
      </div>
    </>
  );
}
