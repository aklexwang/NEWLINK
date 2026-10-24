import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  approveChannel,
  deleteAdminChannel,
  getAdminCategories,
  getAdminChannels,
  promoteChannel,
  rejectChannel,
  rejectInvalidChannels,
  setAdminChannelsVisibility,
  updateAdminChannel,
} from '../../api/admin';
import { AdminCategoryChipBar } from '../../components/admin/AdminCategoryChipBar';
import { AdClientCells, AdClientDetail } from '../../components/admin/AdClientInfo';
import { ChannelAvatarEditor } from '../../components/admin/ChannelAvatarEditor';
import {
  AdminEmptyState,
  AdminMessage,
  AdminTable,
  AdminTableShell,
  AdminTd,
  AdminTh,
  ChannelAvatar,
} from '../../components/admin/AdminTable';
import type { Channel, LinkType, PendingChannel } from '../../types/channel';
import type { CategoryItem } from '../../types/categoryItem';
import { ReporterTonPanel } from '../../components/ReporterTonPanel';
import { refreshAdminBadges } from '../../utils/adminBadges';
import { linkTypeBadgeClass, linkTypeLabel } from '../../utils/linkType';
import {
  dateInputToPromotedUntil,
  defaultPromoteDateInput,
  formatPromotedUntil,
  isPromotionActive,
  toDateInputValue,
} from '../../utils/promotion';

type StatusFilter = '' | 'pending' | 'active' | 'rejected';
type ExtraFilter = '' | 'visible' | 'hidden' | 'pendingCat' | 'recentAuto';

const statusLabel: Record<string, string> = {
  pending: '대기',
  active: '승인',
  rejected: '거절',
};

const statusClass: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

interface AdminLinksManagePageProps {
  linkType?: LinkType;
  title: string;
  subtitle: string;
  emptyMessage: string;
  registerPath?: string;
  registerPaths?: { channel: string; group: string };
  itemLabel: string;
  showTypeColumn?: boolean;
}

export function AdminLinksManagePage({
  linkType,
  title,
  subtitle,
  emptyMessage,
  registerPath,
  registerPaths,
  itemLabel,
  showTypeColumn = false,
}: AdminLinksManagePageProps) {
  const [channels, setChannels] = useState<PendingChannel[]>([]);
  const [countSource, setCountSource] = useState<PendingChannel[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [collectFailedOnly, setCollectFailedOnly] = useState(false);
  const [extraFilter, setExtraFilter] = useState<ExtraFilter>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promoteDates, setPromoteDates] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, countItems, categoryItems] = await Promise.all([
        getAdminChannels({
          status: collectFailedOnly ? undefined : statusFilter || undefined,
          q: query.trim() || undefined,
          category:
            extraFilter === 'pendingCat' ? '분류대기' : categoryFilter || undefined,
          linkType,
          collectStatus: collectFailedOnly ? 'failed' : undefined,
          visibility:
            extraFilter === 'visible' ? 'visible' : extraFilter === 'hidden' ? 'hidden' : undefined,
          autoRegistered: extraFilter === 'recentAuto' ? '1' : undefined,
        }),
        // 카테고리 칩의 총 연결 수는 상태/검색 필터와 무관하게 전체 기준으로 집계
        getAdminChannels({ linkType }),
        getAdminCategories(),
      ]);
      setChannels(items);
      setSelectedIds(new Set());
      setCountSource(countItems);
      setCategories(categoryItems.filter((c) => c.isActive));
      setPromoteDates((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (next[item.id] === undefined) {
            next[item.id] = toDateInputValue(item.promotedUntil) || defaultPromoteDateInput();
          }
        }
        return next;
      });
      setMessage('');
    } catch {
      setMessage(`${itemLabel} 목록을 불러오지 못했습니다.`);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, collectFailedOnly, extraFilter, query, categoryFilter, linkType, itemLabel]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    load();
  };

  const handleApprove = async (id: string) => {
    await approveChannel(id);
    setMessage('승인되었습니다.');
    await load();
  };

  const handleReject = async (id: string) => {
    await rejectChannel(id);
    setMessage('거절되었습니다.');
    await load();
  };

  const handleUpdateMeta = async (
    id: string,
    payload: {
      category?: string;
      title?: string;
      language?: 'ko' | 'foreign' | 'unknown';
      languageLocked?: boolean;
      link?: string;
      isVisible?: boolean;
    },
  ) => {
    try {
      await updateAdminChannel(id, payload);
      if (payload.link) {
        await load();
      } else {
        setChannels((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...payload } : item)),
        );
      }
      setMessage('정보가 저장되었습니다.');
    } catch {
      setMessage('저장에 실패했습니다.');
    }
  };

  const handleBulkVisibility = async (isVisible: boolean) => {
    const ids =
      selectedIds.size > 0 ? [...selectedIds] : channels.map((item) => item.id);
    if (ids.length === 0) return;
    try {
      const result = await setAdminChannelsVisibility(ids, isVisible);
      setMessage(`${result.updated}건의 노출을 ${isVisible ? '켰습니다' : '껐습니다'}.`);
      await load();
    } catch {
      setMessage('노출 변경에 실패했습니다.');
    }
  };

  const handleUpdateAvatar = (id: string, patch: { avatarUrl: string | null; avatarApproved: boolean }) => {
    setChannels((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setMessage('아이콘이 저장되었습니다.');
  };

  const handleDelete = async (id: string, channelTitle: string) => {
    if (!window.confirm(`"${channelTitle}" 항목을 삭제할까요?`)) return;
    await deleteAdminChannel(id);
    setMessage('항목이 삭제되었습니다.');
    if (expandedId === id) setExpandedId(null);
    await load();
  };

  const handleAddToAds = async (channel: Channel, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (channel.status !== 'active') {
      setMessage('승인된 항목만 광고로 등록할 수 있습니다.');
      return;
    }
    const date = promoteDates[channel.id] || defaultPromoteDateInput();
    try {
      await promoteChannel(channel.id, dateInputToPromotedUntil(date));
      setMessage(`"${channel.title}"을(를) 광고로 등록했습니다.`);
      await load();
      refreshAdminBadges();
    } catch {
      setMessage('광고 추가에 실패했습니다.');
    }
  };

  const handleRemoveFromAds = async (channel: Channel, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await updateAdminChannel(channel.id, { isPromoted: false, promotedUntil: null });
      setMessage('광고 노출을 해제했습니다.');
      await load();
      refreshAdminBadges();
    } catch {
      setMessage('광고 해제에 실패했습니다.');
    }
  };

  const handleHideInvalid = async () => {
    const ids = channels
      .filter((item) => selectedIds.has(item.id) && item.collectStatus === 'invalid')
      .map((item) => item.id);
    if (ids.length === 0) {
      setMessage('숨길 invalid 항목을 선택하세요.');
      return;
    }
    if (!window.confirm(`선택한 invalid ${ids.length}개를 숨김(거절) 처리할까요? 삭제되지 않습니다.`)) {
      return;
    }
    try {
      const result = await rejectInvalidChannels(ids);
      setMessage(`${result.rejected}개를 숨김 처리했습니다.`);
      await load();
    } catch {
      setMessage('숨김 처리에 실패했습니다.');
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collectLabel: Record<string, string> = {
    ok: '성공',
    failed: '실패',
    private: '비공개',
    gone: '사라짐',
    invalid: '채널·그룹 아님',
    invite_only: '초대 전용',
    invite_expired: '초대 만료',
    merged: '합침',
  };

  const categoryOptions = categories.map((c) => c.name);
  const languageLabel: Record<string, string> = {
    ko: '한국어',
    foreign: '외국어',
    unknown: '미확인',
  };

  const colCount = collectFailedOnly
    ? 8
    : (showTypeColumn ? 9 : 8) + 3;

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { '': countSource.length };
    for (const category of categories) {
      counts[category.name] = countSource.filter((item) => item.category === category.name).length;
    }
    return counts;
  }, [categories, countSource]);

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          </div>
          {registerPaths ? (
            <div className="flex flex-wrap gap-2">
              <Link
                to={registerPaths.channel}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                채널 등록
              </Link>
              <Link
                to={registerPaths.group}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-black/10 hover:bg-slate-50"
              >
                그룹 등록
              </Link>
            </div>
          ) : registerPath ? (
            <Link
              to={registerPath}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {itemLabel} 등록
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && <AdminMessage message={message} />}

        <AdminCategoryChipBar
          categories={categories}
          selected={categoryFilter}
          onSelect={setCategoryFilter}
          counts={categoryCounts}
        />

        <div className="mb-4 flex flex-wrap gap-2">
          {([
            ['', '전체'],
            ['active', '승인'],
            ['pending', '대기'],
            ['rejected', '거절'],
          ] as const).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => {
                setCollectFailedOnly(false);
                setExtraFilter('');
                setStatusFilter(value);
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium ${!collectFailedOnly && statusFilter === value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-black/10 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCollectFailedOnly(true);
              setExtraFilter('');
              setStatusFilter('');
            }}
            className={`rounded-full px-4 py-2 text-sm font-medium ${collectFailedOnly ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-black/10 hover:bg-slate-50'}`}
          >
            수집 실패
          </button>
          {(
            [
              ['visible', '활성'],
              ['hidden', '비활성'],
              ['pendingCat', '분류대기'],
              ['recentAuto', '최근 자동 등록'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setCollectFailedOnly(false);
                setExtraFilter((prev) => (prev === value ? '' : value));
              }}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                extraFilter === value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 ring-1 ring-black/10 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {collectFailedOnly && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleHideInvalid()}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
            >
              선택한 invalid 숨김
            </button>
            <p className="text-xs text-slate-500">채널·그룹이 아닌 항목만 거절 처리합니다. 삭제는 하지 않습니다.</p>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleBulkVisibility(true)}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            선택 활성
          </button>
          <button
            type="button"
            onClick={() => void handleBulkVisibility(false)}
            className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            선택 비활성
          </button>
          <p className="text-xs text-slate-500">
            체크한 항목이 있으면 그것만, 없으면 지금 보이는 목록을 한 번에 바꿉니다.
          </p>
        </div>

        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목, 링크, 카테고리 검색"
            className="min-w-0 flex-1 rounded-xl bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-black/5 outline-none focus:ring-blue-300"
          />
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            검색
          </button>
        </form>

        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : channels.length === 0 ? (
          <AdminEmptyState message={emptyMessage} />
        ) : (
          <AdminTableShell>
            <AdminTable>
              <thead className="bg-slate-50">
                <tr>
                  {collectFailedOnly ? (
                    <>
                      <AdminTh className="w-10">
                        <span className="sr-only">선택</span>
                      </AdminTh>
                      <AdminTh>제목</AdminTh>
                      <AdminTh className="w-28">아이디</AdminTh>
                      <AdminTh className="w-16">종류</AdminTh>
                      <AdminTh className="w-28">수집</AdminTh>
                      <AdminTh>원인</AdminTh>
                      <AdminTh className="w-40">마지막 시도</AdminTh>
                      <AdminTh className="w-10" />
                    </>
                  ) : (
                    <>
                      <AdminTh className="w-8">
                        <span className="sr-only">선택</span>
                      </AdminTh>
                      <AdminTh className="w-12" />
                      <AdminTh>제목</AdminTh>
                      {showTypeColumn && <AdminTh className="w-16">유형</AdminTh>}
                      <AdminTh className="w-24">카테고리</AdminTh>
                      <AdminTh className="w-16">언어</AdminTh>
                      <AdminTh className="w-16">상태</AdminTh>
                      <AdminTh className="w-36">회원 페이지 노출</AdminTh>
                      <AdminTh className="w-12">👍</AdminTh>
                      <AdminTh className="min-w-[100px]">광고 의뢰</AdminTh>
                      <AdminTh className="w-24">광고</AdminTh>
                      <AdminTh className="w-10" />
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {channels.map((channel) => {
                  const expanded = expandedId === channel.id;
                  return (
                    <Fragment key={channel.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : channel.id)}
                        className={`cursor-pointer transition hover:bg-slate-50/80 ${expanded ? 'bg-blue-50/40' : ''}`}
                      >
                        {collectFailedOnly ? (
                          <>
                            <AdminTd>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(channel.id)}
                                onChange={() => toggleSelected(channel.id)}
                                onClick={(e) => e.stopPropagation()}
                                disabled={
                  collectFailedOnly
                    ? channel.collectStatus !== 'invalid'
                    : extraFilter === ''
                }
                              />
                            </AdminTd>
                            <AdminTd>
                              <p className="max-w-[220px] truncate font-medium text-slate-900">{channel.title}</p>
                            </AdminTd>
                            <AdminTd>
                              <span className="text-xs text-slate-600">@{channel.username || '-'}</span>
                            </AdminTd>
                            <AdminTd>
                              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(channel.linkType)}`}>
                                {linkTypeLabel(channel.linkType)}
                              </span>
                            </AdminTd>
                            <AdminTd>
                              <span
                                className={`text-xs font-medium ${
                                  channel.collectStatus === 'invite_expired'
                                    ? 'text-amber-700'
                                    : 'text-slate-700'
                                }`}
                              >
                                {collectLabel[channel.collectStatus ?? ''] ?? channel.collectStatus ?? '-'}
                              </span>
                            </AdminTd>
                            <AdminTd>
                              <span className="block max-w-[280px] truncate font-mono text-[11px] text-slate-600" title={channel.collectError ?? ''}>
                                {channel.collectError || '-'}
                              </span>
                            </AdminTd>
                            <AdminTd>
                              <span className="text-xs text-slate-500">
                                {channel.lastCollectedAt
                                  ? new Date(channel.lastCollectedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                                  : '-'}
                              </span>
                            </AdminTd>
                            <AdminTd>
                              <span className={`inline-block text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}>▼</span>
                            </AdminTd>
                          </>
                        ) : (
                          <>
                            <AdminTd>
                              <input
                                type="checkbox"
                                checked={selectedIds.has(channel.id)}
                                onChange={() => toggleSelected(channel.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </AdminTd>
                            <AdminTd><ChannelAvatar channel={channel} /></AdminTd>
                            <AdminTd>
                              <p className="max-w-[200px] truncate font-medium text-slate-900">{channel.title}</p>
                              {channel.isPromoted && (
                                <span className="mt-0.5 inline-block rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">광고</span>
                              )}
                            </AdminTd>
                            {showTypeColumn && (
                              <AdminTd>
                                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(channel.linkType)}`}>
                                  {linkTypeLabel(channel.linkType)}
                                </span>
                              </AdminTd>
                            )}
                            <AdminTd><span className="text-xs">{channel.category}</span></AdminTd>
                            <AdminTd>
                              <span className="text-[11px] text-slate-600">
                                {languageLabel[channel.language ?? 'unknown'] ?? '미확인'}
                                {channel.languageLocked ? ' · 수동' : ''}
                              </span>
                            </AdminTd>
                            <AdminTd>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass[channel.status]}`}>
                                {statusLabel[channel.status]}
                              </span>
                              <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                <label className="flex items-center gap-1 text-[11px] text-slate-600">
                                  <input
                                    type="checkbox"
                                    checked={channel.isVisible !== false}
                                    onChange={() =>
                                      handleUpdateMeta(channel.id, { isVisible: channel.isVisible === false })
                                    }
                                  />
                                  {channel.isVisible === false ? '비활성' : '활성'}
                                </label>
                              </div>
                            </AdminTd>
                            <AdminTd>
                              {channel.memberPageVisible ? (
                                <span className="text-[11px] font-medium text-green-700">예</span>
                              ) : (
                                <span className="text-[11px] text-amber-800">
                                  아니오
                                  {channel.memberPageHiddenReason
                                    ? ` (${channel.memberPageHiddenReason})`
                                    : ''}
                                </span>
                              )}
                            </AdminTd>
                            <AdminTd><span className="text-xs tabular-nums">{channel.recommendCount}</span></AdminTd>
                            <AdminTd>
                              {channel.isPromoted ? <AdClientCells channel={channel} /> : <span className="text-xs text-slate-400">-</span>}
                            </AdminTd>
                            <AdminTd>
                              <div onClick={(e) => e.stopPropagation()}>
                                {channel.status === 'active' ? (
                                  isPromotionActive(channel.isPromoted, channel.promotedUntil) ? (
                                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                                      노출 중
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={(e) => handleAddToAds(channel, e)}
                                      className="rounded-lg bg-purple-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-purple-700"
                                    >
                                      광고 추가
                                    </button>
                                  )
                                ) : (
                                  <span className="text-xs text-slate-400">-</span>
                                )}
                              </div>
                            </AdminTd>
                            <AdminTd>
                              <span className={`inline-block text-slate-400 transition ${expanded ? 'rotate-180' : ''}`}>▼</span>
                            </AdminTd>
                          </>
                        )}
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/60">
                          <AdminTd colSpan={colCount}>
                            <div className="space-y-3 py-1" onClick={(e) => e.stopPropagation()}>
                              <form
                                className="flex flex-wrap items-center gap-2"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const form = e.currentTarget;
                                  const input = form.elements.namedItem('title') as HTMLInputElement;
                                  const value = input.value.trim();
                                  if (value && value !== channel.title) {
                                    handleUpdateMeta(channel.id, { title: value });
                                  }
                                }}
                              >
                                <span className="text-xs text-slate-500">제목</span>
                                <input
                                  key={`${channel.id}-${channel.title}`}
                                  name="title"
                                  defaultValue={channel.title}
                                  className="min-w-0 flex-1 rounded-lg bg-white px-3 py-1.5 text-sm outline-none ring-1 ring-black/10 focus:ring-blue-300"
                                  placeholder={`${itemLabel} 이름`}
                                />
                                <button
                                  type="submit"
                                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                >
                                  저장
                                </button>
                              </form>

                              <a href={channel.link} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-blue-600 hover:underline">
                                {channel.link}
                              </a>

                              {(channel.collectStatus === 'invite_expired' ||
                                channel.collectStatus === 'invite_only' ||
                                /t\.me\/\+|joinchat/i.test(channel.link)) && (
                                <form
                                  className="flex flex-wrap items-center gap-2"
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const form = e.currentTarget;
                                    const input = form.elements.namedItem('inviteLink') as HTMLInputElement;
                                    const value = input.value.trim();
                                    if (value && value !== channel.link) {
                                      handleUpdateMeta(channel.id, { link: value });
                                    }
                                  }}
                                >
                                  <span className="text-xs text-slate-500">초대 링크 교체</span>
                                  <input
                                    name="inviteLink"
                                    defaultValue={channel.link}
                                    className="min-w-0 flex-1 rounded-lg bg-white px-3 py-1.5 font-mono text-xs outline-none ring-1 ring-black/10 focus:ring-blue-300"
                                    placeholder="https://t.me/+..."
                                  />
                                  <button
                                    type="submit"
                                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                                  >
                                    링크 저장
                                  </button>
                                </form>
                              )}

                              {channel.isPromoted && <AdClientDetail channel={channel} />}

                              <ChannelAvatarEditor
                                key={`${channel.id}-${channel.avatarUrl ?? 'none'}`}
                                channelId={channel.id}
                                link={channel.link}
                                avatarUrl={channel.avatarUrl}
                                avatarApproved={channel.avatarApproved}
                                linkType={channel.linkType}
                                onUpdated={(patch) => handleUpdateAvatar(channel.id, patch)}
                              />

                              {channel.rewardTonAmount != null && channel.rewardTonAmount > 0 ? (
                                <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-100">
                                  제보 보상 지급됨 · {channel.rewardTonAmount.toLocaleString('ko-KR')} TON/Gram
                                  {channel.rewardPaidAt && (
                                    <span className="ml-1 text-emerald-700/80">
                                      ({new Date(channel.rewardPaidAt).toLocaleString('ko-KR')})
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <ReporterTonPanel
                                  item={channel}
                                  onRecorded={() => {
                                    void load();
                                  }}
                                />
                              )}

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">언어</span>
                                <select
                                  value={
                                    channel.languageLocked
                                      ? (channel.language ?? 'unknown')
                                      : 'auto'
                                  }
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === 'auto') {
                                      handleUpdateMeta(channel.id, { languageLocked: false });
                                      return;
                                    }
                                    handleUpdateMeta(channel.id, {
                                      language: value as 'ko' | 'foreign' | 'unknown',
                                      languageLocked: true,
                                    });
                                  }}
                                  className="rounded-lg bg-white px-2 py-1 text-xs outline-none ring-1 ring-black/10"
                                >
                                  <option value="auto">자동 판별</option>
                                  <option value="ko">한국어</option>
                                  <option value="foreign">외국어</option>
                                  <option value="unknown">미확인</option>
                                </select>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">카테고리</span>
                                <select
                                  value={channel.category}
                                  onChange={(e) => handleUpdateMeta(channel.id, { category: e.target.value })}
                                  className="rounded-lg bg-white px-2 py-1 text-xs outline-none ring-1 ring-black/10"
                                >
                                  {!categoryOptions.includes(channel.category) && (
                                    <option value={channel.category}>{channel.category}</option>
                                  )}
                                  {categoryOptions.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </select>
                                {channel.categoryLocked ? (
                                  <span className="text-[11px] text-slate-500">분류 고정</span>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">공개 노출</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateMeta(channel.id, { isVisible: channel.isVisible === false })
                                  }
                                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                                    channel.isVisible === false
                                      ? 'bg-slate-200 text-slate-700'
                                      : 'bg-emerald-600 text-white'
                                  }`}
                                >
                                  {channel.isVisible === false ? '비활성' : '활성'}
                                </button>
                              </div>

                              {channel.status === 'active' && (
                                <div className="rounded-xl bg-purple-50 px-3 py-3 ring-1 ring-purple-100">
                                  <p className="text-xs font-semibold text-purple-900">홈 Promoted 광고</p>
                                  {isPromotionActive(channel.isPromoted, channel.promotedUntil) && channel.promotedUntil && (
                                    <p className="mt-1 text-[11px] text-purple-700">
                                      노출 종료: {formatPromotedUntil(channel.promotedUntil)}
                                    </p>
                                  )}
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <input
                                      type="date"
                                      value={promoteDates[channel.id] ?? defaultPromoteDateInput()}
                                      onChange={(e) =>
                                        setPromoteDates((prev) => ({ ...prev, [channel.id]: e.target.value }))
                                      }
                                      className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-black/10"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => handleAddToAds(channel, e)}
                                      className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                                    >
                                      {channel.isPromoted ? '광고 기간 변경' : '광고 추가하기'}
                                    </button>
                                    {channel.isPromoted && (
                                      <button
                                        type="button"
                                        onClick={(e) => handleRemoveFromAds(channel, e)}
                                        className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-black/10"
                                      >
                                        광고 해제
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div className="flex flex-wrap gap-2">
                                {channel.status === 'pending' && (
                                  <>
                                    <button type="button" onClick={() => handleApprove(channel.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">승인</button>
                                    <button type="button" onClick={() => handleReject(channel.id)} className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-black/10">거절</button>
                                  </>
                                )}
                                {channel.status === 'rejected' && (
                                  <button type="button" onClick={() => handleApprove(channel.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">재승인</button>
                                )}
                                <button type="button" onClick={() => handleDelete(channel.id, channel.title)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">삭제</button>
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
