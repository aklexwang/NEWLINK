import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  approveChannel,
  collectAdminChannel,
  collectAdminChannels,
  deleteAdminChannel,
  getAdminCategories,
  getAdminChannels,
  promoteChannel,
  rejectChannel,
  rejectInvalidChannels,
  setAdminChannelsCategory,
  setAdminChannelsVisibility,
  updateAdminChannel,
} from '../../api/admin';
import { AdminCategoryChipBar } from '../../components/admin/AdminCategoryChipBar';
import { AdClientCells, AdClientDetail } from '../../components/admin/AdClientInfo';
import { AdminChannelOpens } from '../../components/admin/AdminChannelOpens';
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
import type { Channel, PendingChannel } from '../../types/channel';
import type { CategoryItem } from '../../types/categoryItem';
import { refreshAdminBadges } from '../../utils/adminBadges';
import { linkTypeBadgeClass, linkTypeLabel } from '../../utils/linkType';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { isInviteLink } from '../../utils/channelDetailPath';
import {
  dateInputToPromotedUntil,
  defaultPromoteDateInput,
  formatPromotedUntil,
  isPromotionActive,
  toDateInputValue,
} from '../../utils/promotion';

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
const HIDE_REASONS = [
  '승인되지 않음',
  '관리자가 숨김',
  '아직 수집되지 않음',
  '채널·그룹 아님',
  '사라진 채널',
  '합쳐진 채널',
  '초대 만료',
  '외국어',
  '분류대기',
  '성인 카테고리',
  '불법 의심(관리자 확인)',
];

type Draft = {
  title: string;
  language: 'ko' | 'foreign' | 'unknown' | 'auto';
  category: string;
  categoryLocked: boolean;
  isVisible: boolean;
  illegalCleared: boolean;
};

function param(params: URLSearchParams, key: string) {
  return params.get(key) ?? '';
}

export function AdminLinksManagePage() {
  const [params, setParams] = useSearchParams();
  const [channels, setChannels] = useState<PendingChannel[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [queryInput, setQueryInput] = useState(param(params, 'q'));
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [promoteDates, setPromoteDates] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saveHint, setSaveHint] = useState<Record<string, string>>({});
  const [bulkCategory, setBulkCategory] = useState('');
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [collectCooldownUntil, setCollectCooldownUntil] = useState<Record<string, number>>({});
  const [collectNow, setCollectNow] = useState(Date.now());

  const type = param(params, 'type');
  const page = Number(param(params, 'page') || '1');
  const collectFailedOnly = param(params, 'collectStatus') === 'failed';

  const patchParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      if (!('page' in patch)) next.set('page', '1');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, categoryItems] = await Promise.all([
        getAdminChannels({
          status: collectFailedOnly ? undefined : param(params, 'status') || undefined,
          q: param(params, 'q') || undefined,
          category: param(params, 'category') || undefined,
          linkType: type === 'channel' || type === 'group' ? type : undefined,
          collectStatus: param(params, 'collectStatus') || undefined,
          visibility: (param(params, 'visibility') as 'visible' | 'hidden') || undefined,
          language: param(params, 'language') || undefined,
          source: param(params, 'source') || undefined,
          memberPage: param(params, 'memberPage') || undefined,
          hideReason: param(params, 'hideReason') || undefined,
          createdFrom: param(params, 'createdFrom') || undefined,
          sort: param(params, 'sort') || undefined,
          page,
          pageSize: Number(param(params, 'pageSize') || 50),
        }),
        getAdminCategories(),
      ]);
      setChannels(result.items);
      setTotal(result.total);
      setPageSize(result.pageSize);
      setCategoryCounts(result.categoryCounts ?? {});
      setSelectedIds(new Set());
      setCategories(categoryItems.filter((c) => c.isActive));
      setPromoteDates((prev) => {
        const next = { ...prev };
        for (const item of result.items) {
          if (next[item.id] === undefined) {
            next[item.id] = toDateInputValue(item.promotedUntil) || defaultPromoteDateInput();
          }
        }
        return next;
      });
      setMessage('');
    } catch {
      setMessage('목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [params, collectFailedOnly, type, page]);

  useEffect(() => {
    setQueryInput(param(params, 'q'));
  }, [params]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveDraft = async (channel: PendingChannel) => {
    const draft = drafts[channel.id] ?? draftFromChannel(channel);
    const languageLocked = draft.language !== 'auto';
    const language = languageLocked ? draft.language : channel.language;
    const payload: Parameters<typeof updateAdminChannel>[1] = {};
    if (draft.title.trim() && draft.title.trim() !== channel.title) payload.title = draft.title.trim();
    if (draft.category !== channel.category) payload.category = draft.category;
    if (draft.categoryLocked !== Boolean(channel.categoryLocked)) payload.categoryLocked = draft.categoryLocked;
    if (draft.isVisible !== (channel.isVisible !== false)) payload.isVisible = draft.isVisible;
    if (draft.illegalCleared !== Boolean(channel.illegalCleared)) payload.illegalCleared = draft.illegalCleared;
    if (languageLocked !== Boolean(channel.languageLocked)) payload.languageLocked = languageLocked;
    if (languageLocked && language && language !== channel.language) {
      payload.language = language as 'ko' | 'foreign' | 'unknown';
      payload.languageLocked = true;
    }
    if (Object.keys(payload).length === 0) {
      setSaveHint((prev) => ({ ...prev, [channel.id]: '바뀐 내용이 없습니다' }));
      return;
    }
    try {
      await updateAdminChannel(channel.id, payload);
      setSaveHint((prev) => ({ ...prev, [channel.id]: '저장했습니다' }));
      await load();
    } catch {
      setSaveHint((prev) => ({ ...prev, [channel.id]: '저장에 실패했습니다' }));
    }
  };

  useEffect(() => {
    const pending = Object.values(collectCooldownUntil).some((until) => until > Date.now());
    if (!pending) return;
    const timer = window.setInterval(() => setCollectNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [collectCooldownUntil]);

  const collectButtonLabel = (id: string) => {
    if (collectingId === id) return '수집 중…';
    const left = Math.ceil(((collectCooldownUntil[id] ?? 0) - collectNow) / 1000);
    if (left > 0) return `다시 수집 (${left}초)`;
    return '지금 수집';
  };

  const handleCollect = async (id: string) => {
    if (collectingId === id) return;
    const left = (collectCooldownUntil[id] ?? 0) - Date.now();
    if (left > 0) return;
    setCollectingId(id);
    setCollectCooldownUntil((prev) => ({ ...prev, [id]: Date.now() + 60_000 }));
    try {
      const updated = await collectAdminChannel(id);
      setChannels((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)));
      setMessage('수집이 끝났습니다.');
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '수집에 실패했습니다.'));
    } finally {
      setCollectingId(null);
    }
  };

  const selectedList = [...selectedIds];
  const bulkDisabled = selectedList.length === 0;

  const handleBulkCollect = async () => {
    const ids = selectedList.slice(0, 20);
    if (ids.length === 0) return;
    try {
      const result = await collectAdminChannels(ids);
      const ok = result.results.filter((row) => row.ok).length;
      const fail = result.results.length - ok;
      setMessage(`수집 완료 ${ok}건, 실패 ${fail}건`);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '일괄 수집에 실패했습니다.'));
    }
  };

  const handleSaveLink = async (channel: PendingChannel) => {
    const link = (linkDrafts[channel.id] ?? channel.link).trim();
    if (!link) {
      setSaveHint((prev) => ({ ...prev, [channel.id]: '링크가 필요합니다' }));
      return;
    }
    if (link === channel.link) {
      setSaveHint((prev) => ({ ...prev, [channel.id]: '바뀐 링크가 없습니다' }));
      return;
    }
    try {
      await updateAdminChannel(channel.id, { link });
      setSaveHint((prev) => ({ ...prev, [channel.id]: '링크를 저장했습니다' }));
      await load();
    } catch (error) {
      setSaveHint((prev) => ({
        ...prev,
        [channel.id]: adminApiErrorMessage(error, '링크 저장에 실패했습니다'),
      }));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedList.length === 0) return;
    if (!window.confirm(`선택한 ${selectedList.length}개를 삭제할까요?`)) return;
    for (const id of selectedList) {
      await deleteAdminChannel(id);
    }
    setMessage('삭제가 끝났습니다.');
    await load();
  };

  const handleBulkCategory = async () => {
    if (!bulkCategory || selectedList.length === 0) return;
    const result = await setAdminChannelsCategory(selectedList, bulkCategory);
    setMessage(`${result.updated}건의 카테고리를 바꿨습니다.`);
    await load();
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
  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`"${title}" 항목을 삭제할까요?`)) return;
    await deleteAdminChannel(id);
    setMessage('항목이 삭제되었습니다.');
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
  const languageLabel: Record<string, string> = {
    ko: '한국어',
    foreign: '외국어',
    unknown: '미확인',
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const colCount = collectFailedOnly ? 8 : 12;
  const categoryOptions = categories.map((c) => c.name);

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">채널·그룹 관리</h2>
            <p className="mt-1 text-sm text-slate-500">목록은 서버에서 나눠 가져옵니다. 필터는 주소에 남습니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/register-link" className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              링크 등록
            </Link>
          </div>
        </div>
        <div className="mt-4 inline-flex rounded-xl bg-slate-100 p-1">
          {([['', '전체'], ['channel', '채널'], ['group', '그룹']] as const).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => patchParams({ type: value })}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${type === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && <AdminMessage message={message} />}
        <AdminCategoryChipBar
          categories={categories}
          selected={param(params, 'category')}
          onSelect={(value) => patchParams({ category: value })}
          counts={categoryCounts}
        />

        <div className="mb-4 flex flex-wrap gap-2">
          <select value={param(params, 'status')} onChange={(e) => patchParams({ status: e.target.value })} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10">
            <option value="">상태 전체</option>
            <option value="active">승인</option>
            <option value="pending">대기</option>
            <option value="rejected">거절</option>
          </select>
          <select value={param(params, 'memberPage')} onChange={(e) => patchParams({ memberPage: e.target.value })} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10">
            <option value="">회원 페이지 전체</option>
            <option value="yes">노출</option>
            <option value="no">숨김</option>
          </select>
          <select value={param(params, 'hideReason')} onChange={(e) => patchParams({ hideReason: e.target.value, memberPage: e.target.value ? 'no' : param(params, 'memberPage') })} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10">
            <option value="">숨김 이유 전체</option>
            {HIDE_REASONS.map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
          <select value={param(params, 'language')} onChange={(e) => patchParams({ language: e.target.value })} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10">
            <option value="">언어 전체</option>
            <option value="ko">한국어</option>
            <option value="foreign">외국어</option>
            <option value="unknown">미확인</option>
          </select>
          <select value={param(params, 'collectStatus')} onChange={(e) => patchParams({ collectStatus: e.target.value })} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10">
            <option value="">수집 상태 전체</option>
            <option value="ok">성공</option>
            <option value="failed">실패 묶음</option>
            <option value="none">없음</option>
            <option value="invalid">채널·그룹 아님</option>
            <option value="gone">사라짐</option>
            <option value="private">비공개</option>
            <option value="invite_only">초대 전용</option>
            <option value="invite_expired">초대 만료</option>
          </select>
          <select value={param(params, 'source')} onChange={(e) => patchParams({ source: e.target.value })} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10">
            <option value="">등록 경로 전체</option>
            <option value="auto">자동</option>
            <option value="admin">어드민</option>
            <option value="report">제보</option>
          </select>
          <select value={param(params, 'visibility')} onChange={(e) => patchParams({ visibility: e.target.value })} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10">
            <option value="">공개 노출 전체</option>
            <option value="visible">활성</option>
            <option value="hidden">비활성</option>
          </select>
          <select value={param(params, 'sort')} onChange={(e) => patchParams({ sort: e.target.value })} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10">
            <option value="">최근 등록순</option>
            <option value="members_desc">구독자 많은순</option>
            <option value="collected_desc">최근 수집순</option>
            <option value="title_asc">이름순</option>
          </select>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={bulkDisabled} onClick={() => void setAdminChannelsVisibility(selectedList, true).then(() => load())} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">노출 켜기</button>
          <button type="button" disabled={bulkDisabled} onClick={() => void setAdminChannelsVisibility(selectedList, false).then(() => load())} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">노출 끄기</button>
          <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/10">
            <option value="">카테고리 일괄</option>
            {categoryOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button type="button" disabled={bulkDisabled} onClick={() => void handleBulkCategory()} className="rounded-xl bg-white px-4 py-2 text-sm ring-1 ring-black/10 disabled:opacity-50">카테고리 변경</button>
          <button type="button" disabled={bulkDisabled} onClick={() => void handleBulkCollect()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">지금 수집 (최대 20)</button>
          <button type="button" disabled={bulkDisabled} onClick={() => void handleBulkDelete()} className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600 disabled:opacity-50">삭제</button>
          {collectFailedOnly && (
            <button type="button" disabled={bulkDisabled} onClick={() => void rejectInvalidChannels(selectedList).then((r) => { setMessage(`${r.rejected}개를 숨김 처리했습니다.`); void load(); })} className="rounded-xl bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-50">
              선택한 invalid 숨김
            </button>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            patchParams({ q: queryInput.trim() });
          }}
          className="mb-4 flex gap-2"
        >
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="제목, username, 링크 검색"
            className="min-w-0 flex-1 rounded-xl bg-white px-4 py-2.5 text-sm shadow-sm ring-1 ring-black/5 outline-none focus:ring-blue-300"
          />
          <button type="submit" className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white">검색</button>
        </form>

        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : channels.length === 0 ? (
          <AdminEmptyState message="조건에 맞는 항목이 없습니다." />
        ) : (
          <AdminTableShell>
            <AdminTable>
              <thead className="bg-slate-50">
                <tr>
                  <AdminTh className="w-8" />
                  <AdminTh className="w-12" />
                  <AdminTh>제목</AdminTh>
                  <AdminTh className="w-16">유형</AdminTh>
                  <AdminTh className="w-24">카테고리</AdminTh>
                  <AdminTh className="w-16">언어</AdminTh>
                  <AdminTh className="w-16">상태</AdminTh>
                  <AdminTh className="w-36">회원 페이지 노출</AdminTh>
                  <AdminTh className="w-12">👍</AdminTh>
                  <AdminTh>광고 의뢰</AdminTh>
                  <AdminTh className="w-24">광고</AdminTh>
                  <AdminTh className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {channels.map((channel) => {
                  const expanded = expandedId === channel.id;
                  const draft = drafts[channel.id] ?? draftFromChannel(channel);
                  return (
                    <Fragment key={channel.id}>
                      <tr onClick={() => {
                        setExpandedId(expanded ? null : channel.id);
                        setDrafts((prev) => prev[channel.id] ? prev : { ...prev, [channel.id]: draftFromChannel(channel) });
                      }} className={`cursor-pointer hover:bg-slate-50/80 ${expanded ? 'bg-blue-50/40' : ''}`}>
                        <AdminTd>
                          <input type="checkbox" checked={selectedIds.has(channel.id)} onChange={() => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(channel.id)) next.delete(channel.id);
                              else next.add(channel.id);
                              return next;
                            });
                          }} onClick={(e) => e.stopPropagation()} />
                        </AdminTd>
                        <AdminTd><ChannelAvatar channel={channel} /></AdminTd>
                        <AdminTd>
                          <p className="max-w-[200px] truncate font-medium text-slate-900">{channel.title}</p>
                          <p className="text-[11px] text-slate-400">@{channel.username || '-'}</p>
                        </AdminTd>
                        <AdminTd>
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(channel.linkType)}`}>{linkTypeLabel(channel.linkType)}</span>
                        </AdminTd>
                        <AdminTd><span className="text-xs">{channel.category}</span></AdminTd>
                        <AdminTd><span className="text-[11px] text-slate-600">{languageLabel[channel.language ?? 'unknown']}</span></AdminTd>
                        <AdminTd>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass[channel.status]}`}>{statusLabel[channel.status]}</span>
                        </AdminTd>
                        <AdminTd>
                          {channel.memberPageVisible ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">예</span>
                          ) : (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              아니오 · {channel.memberPageReasonKey || channel.memberPageHiddenReason || '숨김'}
                            </span>
                          )}
                        </AdminTd>
                        <AdminTd>{channel.recommendCount}</AdminTd>
                        <AdminTd>{channel.isPromoted ? <AdClientCells channel={channel} /> : <span className="text-xs text-slate-400">-</span>}</AdminTd>
                        <AdminTd>
                          {channel.status === 'active' && isPromotionActive(channel.isPromoted, channel.promotedUntil) ? (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] text-purple-700">노출 중</span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </AdminTd>
                        <AdminTd><span className={`inline-block text-slate-400 ${expanded ? 'rotate-180' : ''}`}>▼</span></AdminTd>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/60">
                          <AdminTd colSpan={colCount}>
                            <div className="space-y-3 py-1" onClick={(e) => e.stopPropagation()}>
                              <a href={channel.link} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-blue-600 hover:underline">{channel.link}</a>
                              {channel.collectStatus && (
                                <p className="text-[11px] text-slate-500">수집 {collectLabel[channel.collectStatus] ?? channel.collectStatus} {channel.collectError ? `· ${channel.collectError}` : ''}</p>
                              )}
                              {(channel.collectStatus === 'invite_expired' ||
                                channel.collectStatus === 'invite_only' ||
                                isInviteLink(channel.link)) && (
                                <div className="space-y-2 rounded-xl bg-amber-50 px-3 py-3 ring-1 ring-amber-100">
                                  <p className="text-xs text-amber-800">
                                    초대 링크는 제목 저장과 별도로 바꿔 주세요.
                                  </p>
                                  <label className="block text-xs text-slate-500">
                                    초대 링크 교체
                                    <input
                                      value={linkDrafts[channel.id] ?? channel.link}
                                      onChange={(e) =>
                                        setLinkDrafts((prev) => ({
                                          ...prev,
                                          [channel.id]: e.target.value,
                                        }))
                                      }
                                      className="mt-1 w-full rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-black/10"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => void handleSaveLink(channel)}
                                    className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white"
                                  >
                                    링크 저장
                                  </button>
                                </div>
                              )}
                              <AdminChannelOpens channelId={channel.id} />
                              {channel.isPromoted && <AdClientDetail channel={channel} />}
                              <ChannelAvatarEditor
                                key={`${channel.id}-${channel.avatarUrl ?? 'none'}`}
                                channelId={channel.id}
                                link={channel.link}
                                avatarUrl={channel.avatarUrl}
                                avatarApproved={channel.avatarApproved}
                                linkType={channel.linkType}
                                onUpdated={(patch) => setChannels((prev) => prev.map((item) => (item.id === channel.id ? { ...item, ...patch } : item)))}
                              />
                              <div className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
                                제보 보상은{' '}
                                <Link to="/admin/pending?tab=payout" className="font-medium text-primary underline">
                                  제보·보상 화면에서 지급
                                </Link>
                                합니다.
                                {channel.rewardTonAmount != null && channel.rewardTonAmount > 0
                                  ? ` (TON ${channel.rewardTonAmount} 기록됨)`
                                  : ''}
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <label className="text-xs text-slate-500">
                                  제목
                                  <input value={draft.title} onChange={(e) => setDrafts((prev) => ({ ...prev, [channel.id]: { ...draft, title: e.target.value } }))} className="mt-1 w-full rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-black/10" />
                                </label>
                                <label className="text-xs text-slate-500">
                                  언어
                                  <select value={draft.language} onChange={(e) => setDrafts((prev) => ({ ...prev, [channel.id]: { ...draft, language: e.target.value as Draft['language'] } }))} className="mt-1 w-full rounded-lg bg-white px-2 py-1.5 text-sm ring-1 ring-black/10">
                                    <option value="auto">자동 판별</option>
                                    <option value="ko">한국어</option>
                                    <option value="foreign">외국어</option>
                                    <option value="unknown">미확인</option>
                                  </select>
                                </label>
                                <label className="text-xs text-slate-500">
                                  카테고리
                                  <select value={draft.category} onChange={(e) => setDrafts((prev) => ({ ...prev, [channel.id]: { ...draft, category: e.target.value } }))} className="mt-1 w-full rounded-lg bg-white px-2 py-1.5 text-sm ring-1 ring-black/10">
                                    {!categoryOptions.includes(draft.category) && <option value={draft.category}>{draft.category}</option>}
                                    {categoryOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                                  </select>
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                  <input type="checkbox" checked={draft.categoryLocked} onChange={(e) => setDrafts((prev) => ({ ...prev, [channel.id]: { ...draft, categoryLocked: e.target.checked } }))} />
                                  분류 고정
                                </label>
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                  <input type="checkbox" checked={draft.isVisible} onChange={(e) => setDrafts((prev) => ({ ...prev, [channel.id]: { ...draft, isVisible: e.target.checked } }))} />
                                  공개 노출 활성
                                </label>
                                {(channel.memberPageReasonKey === '불법 의심(관리자 확인)' ||
                                  draft.illegalCleared ||
                                  Boolean(channel.illegalCleared)) && (
                                  <label className="flex items-center gap-2 text-xs text-slate-600">
                                    <input
                                      type="checkbox"
                                      checked={draft.illegalCleared}
                                      onChange={(e) =>
                                        setDrafts((prev) => ({
                                          ...prev,
                                          [channel.id]: {
                                            ...draft,
                                            illegalCleared: e.target.checked,
                                          },
                                        }))
                                      }
                                    />
                                    {draft.illegalCleared
                                      ? '불법 의심 문제없음 (체크 해제하면 다시 숨김)'
                                      : '불법 의심 · 문제없음으로 풀기'}
                                  </label>
                                )}
                              </div>
                              {channel.status === 'active' && (
                                <div className="rounded-xl bg-purple-50 px-3 py-3 ring-1 ring-purple-100">
                                  <p className="text-xs font-semibold text-purple-900">홈 Promoted 광고</p>
                                  {isPromotionActive(channel.isPromoted, channel.promotedUntil) && channel.promotedUntil && (
                                    <p className="mt-1 text-[11px] text-purple-700">노출 종료: {formatPromotedUntil(channel.promotedUntil)}</p>
                                  )}
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <input type="date" value={promoteDates[channel.id] ?? defaultPromoteDateInput()} onChange={(e) => setPromoteDates((prev) => ({ ...prev, [channel.id]: e.target.value }))} className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-black/10" />
                                    <button type="button" onClick={(e) => handleAddToAds(channel, e)} className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs text-white">{channel.isPromoted ? '광고 기간 변경' : '광고 추가하기'}</button>
                                  </div>
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => void handleSaveDraft(channel)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white">저장</button>
                                <button type="button" disabled={collectingId === channel.id || (collectCooldownUntil[channel.id] ?? 0) > collectNow} onClick={() => void handleCollect(channel.id)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">{collectButtonLabel(channel.id)}</button>
                                {saveHint[channel.id] && <span className="text-xs text-slate-600">{saveHint[channel.id]}</span>}
                                {channel.status === 'pending' && (
                                  <>
                                    <button type="button" onClick={() => handleApprove(channel.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white">승인</button>
                                    <button type="button" onClick={() => handleReject(channel.id)} className="rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-black/10">거절</button>
                                  </>
                                )}
                                {channel.status === 'rejected' && (
                                  <button type="button" onClick={() => handleApprove(channel.id)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white">재승인</button>
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

        <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
          <span>총 {total}건 · {page}/{totalPages}페이지</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => patchParams({ page: String(page - 1) })} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-black/10 disabled:opacity-40">이전</button>
            <button type="button" disabled={page >= totalPages} onClick={() => patchParams({ page: String(page + 1) })} className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-black/10 disabled:opacity-40">다음</button>
          </div>
        </div>
      </div>
    </>
  );
}

function draftFromChannel(channel: PendingChannel): Draft {
  return {
    title: channel.title,
    language: channel.languageLocked ? (channel.language ?? 'unknown') : 'auto',
    category: channel.category,
    categoryLocked: Boolean(channel.categoryLocked),
    isVisible: channel.isVisible !== false,
    illegalCleared: Boolean(channel.illegalCleared),
  };
}
