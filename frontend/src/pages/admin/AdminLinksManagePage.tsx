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
  titleLocked: boolean;
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
  // 편집 창은 화면 오른쪽에서 열린다(목록 아래로 펼치지 않음)
  useEffect(() => {
    if (!expandedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedId]);
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
    if (draft.titleLocked !== Boolean(channel.titleLocked)) payload.titleLocked = draft.titleLocked;
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
      const note = (updated as { collectNote?: string | null }).collectNote;
      setMessage(note ? `수집이 끝났습니다 · ${note}` : '수집이 끝났습니다.');
      // 목록 아래쪽에서 누르면 맨 위 안내가 안 보이므로 버튼 옆에도 보여 준다
      setSaveHint((prev) => ({ ...prev, [id]: note ? `수집 끝 · ${note}` : '수집 끝' }));
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
  const drawerChannel = expandedId ? (channels.find((item) => item.id === expandedId) ?? null) : null;
  const categoryOptions = categories.map((c) => c.name);

  return (
    <>
      <header className="px-4 pt-1 pb-4 md:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mt-1 text-sm text-muted-foreground">목록은 서버에서 나눠 가져옵니다. 필터는 주소에 남습니다.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/register-link" className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90">
              링크 등록
            </Link>
          </div>
        </div>
        <div className="mt-4 inline-flex rounded-xl bg-muted p-1">
          {([['', '전체'], ['channel', '채널'], ['group', '그룹']] as const).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              onClick={() => patchParams({ type: value })}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${type === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
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
          <select value={param(params, 'status')} onChange={(e) => patchParams({ status: e.target.value })} className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
            <option value="">상태 전체</option>
            <option value="active">승인</option>
            <option value="pending">대기</option>
            <option value="rejected">거절</option>
          </select>
          <select value={param(params, 'memberPage')} onChange={(e) => patchParams({ memberPage: e.target.value })} className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
            <option value="">회원 페이지 전체</option>
            <option value="yes">노출</option>
            <option value="no">숨김</option>
          </select>
          <select value={param(params, 'hideReason')} onChange={(e) => patchParams({ hideReason: e.target.value, memberPage: e.target.value ? 'no' : param(params, 'memberPage') })} className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
            <option value="">숨김 이유 전체</option>
            {HIDE_REASONS.map((reason) => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
          <select value={param(params, 'language')} onChange={(e) => patchParams({ language: e.target.value })} className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
            <option value="">언어 전체</option>
            <option value="ko">한국어</option>
            <option value="foreign">외국어</option>
            <option value="unknown">미확인</option>
          </select>
          <select value={param(params, 'collectStatus')} onChange={(e) => patchParams({ collectStatus: e.target.value })} className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
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
          <select value={param(params, 'source')} onChange={(e) => patchParams({ source: e.target.value })} className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
            <option value="">등록 경로 전체</option>
            <option value="auto">자동</option>
            <option value="admin">어드민</option>
            <option value="report">제보</option>
          </select>
          <select value={param(params, 'visibility')} onChange={(e) => patchParams({ visibility: e.target.value })} className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
            <option value="">공개 노출 전체</option>
            <option value="visible">활성</option>
            <option value="hidden">비활성</option>
          </select>
          <select value={param(params, 'sort')} onChange={(e) => patchParams({ sort: e.target.value })} className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
            <option value="">최근 등록순</option>
            <option value="members_desc">구독자 많은순</option>
            <option value="collected_desc">최근 수집순</option>
            <option value="title_asc">이름순</option>
          </select>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" disabled={bulkDisabled} onClick={() => void setAdminChannelsVisibility(selectedList, true).then(() => load())} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">노출 켜기</button>
          <button type="button" disabled={bulkDisabled} onClick={() => void setAdminChannelsVisibility(selectedList, false).then(() => load())} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">노출 끄기</button>
          <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className="rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border">
            <option value="">카테고리 일괄</option>
            {categoryOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button type="button" disabled={bulkDisabled} onClick={() => void handleBulkCategory()} className="rounded-xl bg-card px-4 py-2 text-sm ring-1 ring-border disabled:opacity-50">카테고리 변경</button>
          <button type="button" disabled={bulkDisabled} onClick={() => void handleBulkCollect()} className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">지금 수집 (최대 20)</button>
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
            className="min-w-0 flex-1 rounded-xl bg-card px-4 py-2.5 text-sm outline-none focus:ring-ring/40 shadow-[var(--hz-shadow)]"
          />
          <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-white">검색</button>
        </form>

        {loading ? (
          <div className="h-32 animate-pulse rounded-[20px] bg-card shadow-[var(--hz-shadow)]" />
        ) : channels.length === 0 ? (
          <AdminEmptyState message="조건에 맞는 항목이 없습니다." />
        ) : (
          <AdminTableShell>
            <AdminTable>
              <thead className="bg-muted">
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
              <tbody className="divide-y divide-border">
                {channels.map((channel) => {
                  const expanded = expandedId === channel.id;
                  return (
                    <Fragment key={channel.id}>
                      <tr onClick={() => {
                        setExpandedId(expanded ? null : channel.id);
                        setDrafts((prev) => prev[channel.id] ? prev : { ...prev, [channel.id]: draftFromChannel(channel) });
                      }} className={`cursor-pointer hover:bg-muted/80 ${expanded ? 'bg-primary/5' : ''}`}>
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
                          <p className="max-w-[200px] truncate font-medium text-foreground">{channel.title}</p>
                          <p className="text-[11px] text-muted-foreground">@{channel.username || '-'}</p>
                        </AdminTd>
                        <AdminTd>
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(channel.linkType)}`}>{linkTypeLabel(channel.linkType)}</span>
                        </AdminTd>
                        <AdminTd><span className="text-xs">{channel.category}</span></AdminTd>
                        <AdminTd><span className="text-[11px] text-subtle">{languageLabel[channel.language ?? 'unknown']}</span></AdminTd>
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
                        <AdminTd>{channel.isPromoted ? <AdClientCells channel={channel} /> : <span className="text-xs text-muted-foreground">-</span>}</AdminTd>
                        <AdminTd>
                          {channel.status === 'active' && isPromotionActive(channel.isPromoted, channel.promotedUntil) ? (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] text-purple-700">노출 중</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </AdminTd>
                        <AdminTd><span className={`inline-block text-muted-foreground ${expanded ? 'text-primary' : ''}`}>›</span></AdminTd>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </AdminTable>
          </AdminTableShell>
        )}

        {drawerChannel && (() => {
          const channel = drawerChannel;
          const draft = drafts[channel.id] ?? draftFromChannel(channel);
          const setDraft = (patch: Partial<Draft>) =>
            setDrafts((prev) => ({ ...prev, [channel.id]: { ...draft, ...patch } }));
          const inputClass =
            'mt-1.5 h-11 w-full rounded-xl bg-card px-3.5 text-[15px] text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50';
          const checkClass = 'flex items-center gap-2.5 text-sm text-foreground';
          const showIllegal =
            channel.memberPageReasonKey === '불법 의심(관리자 확인)' ||
            draft.illegalCleared ||
            Boolean(channel.illegalCleared);
          return (
            <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`${channel.title} 편집`}>
              <button type="button" aria-label="닫기" className="absolute inset-0 bg-black/40" onClick={() => setExpandedId(null)} />
              <aside className="relative flex h-full w-full max-w-[600px] flex-col bg-background shadow-2xl">
                {/* 머리글 */}
                <div className="flex items-start gap-4 border-b border-border bg-card px-6 py-5">
                  <div className="scale-125 pt-1"><ChannelAvatar channel={channel} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-bold text-foreground">{channel.title}</p>
                    <p className="mt-1 text-sm text-subtle">
                      @{channel.username || '아이디 없음'} · {linkTypeLabel(channel.linkType)} · {channel.category}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                      <span className={`rounded-full px-2.5 py-1 font-medium ${statusClass[channel.status]}`}>{statusLabel[channel.status]}</span>
                      {channel.memberPageVisible ? (
                        <span className="rounded-full bg-green-100 px-2.5 py-1 font-medium text-green-800">회원 페이지 노출</span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                          숨김 · {channel.memberPageReasonKey || channel.memberPageHiddenReason || '숨김'}
                        </span>
                      )}
                      {channel.collectStatus && (
                        <span className="rounded-full bg-muted px-2.5 py-1 text-subtle">
                          수집 {collectLabel[channel.collectStatus] ?? channel.collectStatus}
                        </span>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={() => setExpandedId(null)} className="rounded-full p-2 text-lg text-muted-foreground hover:bg-muted" aria-label="닫기">✕</button>
                </div>

                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5" onClick={(e) => e.stopPropagation()}>
                  <a href={channel.link} target="_blank" rel="noopener noreferrer" className="block truncate text-sm font-medium text-primary hover:underline">
                    {channel.link}
                  </a>
                  {channel.collectError && (
                    <p className="-mt-3 text-sm text-muted-foreground">수집 메모 · {channel.collectError}</p>
                  )}

                  {/* 기본 정보 */}
                  <section className="space-y-4 rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
                    <h3 className="text-base font-bold text-foreground">기본 정보</h3>
                    <label className="block text-sm font-medium text-subtle">
                      제목
                      <input
                        value={draft.title}
                        onChange={(e) => {
                          const title = e.target.value;
                          // 제목을 바꾸면 수집이 덮어쓰지 않도록 고정을 자동으로 켠다(풀고 싶으면 체크 해제)
                          const changed = title.trim() !== channel.title;
                          setDraft({ title, titleLocked: changed ? true : Boolean(channel.titleLocked) });
                        }}
                        className={inputClass}
                      />
                    </label>
                    <label className={checkClass}>
                      <input type="checkbox" className="h-5 w-5" checked={draft.titleLocked} onChange={(e) => setDraft({ titleLocked: e.target.checked })} />
                      제목 고정 <span className="text-xs text-muted-foreground">(풀면 다음 수집 때 텔레그램 제목으로 바뀝니다)</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-sm font-medium text-subtle">
                        카테고리
                        <select value={draft.category} onChange={(e) => setDraft({ category: e.target.value })} className={inputClass}>
                          {!categoryOptions.includes(draft.category) && <option value={draft.category}>{draft.category}</option>}
                          {categoryOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      </label>
                      <label className="block text-sm font-medium text-subtle">
                        언어
                        <select value={draft.language} onChange={(e) => setDraft({ language: e.target.value as Draft['language'] })} className={inputClass}>
                          <option value="auto">자동 판별</option>
                          <option value="ko">한국어</option>
                          <option value="foreign">외국어</option>
                          <option value="unknown">미확인</option>
                        </select>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <label className={checkClass}>
                        <input type="checkbox" className="h-5 w-5" checked={draft.categoryLocked} onChange={(e) => setDraft({ categoryLocked: e.target.checked })} />
                        분류 고정
                      </label>
                      <label className={checkClass}>
                        <input type="checkbox" className="h-5 w-5" checked={draft.isVisible} onChange={(e) => setDraft({ isVisible: e.target.checked })} />
                        회원 화면에 공개
                      </label>
                      {showIllegal && (
                        <label className={checkClass}>
                          <input type="checkbox" className="h-5 w-5" checked={draft.illegalCleared} onChange={(e) => setDraft({ illegalCleared: e.target.checked })} />
                          {draft.illegalCleared ? '불법 의심 문제없음 (해제하면 다시 숨김)' : '불법 의심 · 문제없음으로 풀기'}
                        </label>
                      )}
                    </div>
                  </section>

                  {/* 초대 링크 */}
                  {(channel.collectStatus === 'invite_expired' ||
                    channel.collectStatus === 'invite_only' ||
                    isInviteLink(channel.link)) && (
                    <section className="space-y-3 rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
                      <h3 className="text-base font-bold text-foreground">초대 링크</h3>
                      <p className="text-sm text-subtle">초대 링크는 위 [저장]과 따로, 여기서 바꿔 저장해요.</p>
                      <input
                        value={linkDrafts[channel.id] ?? channel.link}
                        onChange={(e) => setLinkDrafts((prev) => ({ ...prev, [channel.id]: e.target.value }))}
                        className={inputClass}
                      />
                      <button type="button" onClick={() => void handleSaveLink(channel)} className="h-10 rounded-xl bg-warning px-4 text-sm font-semibold text-white">
                        링크 저장
                      </button>
                    </section>
                  )}

                  {/* 아이콘 */}
                  <section className="space-y-3 rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
                    <h3 className="text-base font-bold text-foreground">아이콘</h3>
                    <ChannelAvatarEditor
                      key={`${channel.id}-${channel.avatarUrl ?? 'none'}`}
                      channelId={channel.id}
                      link={channel.link}
                      avatarUrl={channel.avatarUrl}
                      avatarApproved={channel.avatarApproved}
                      linkType={channel.linkType}
                      onUpdated={(patch) => setChannels((prev) => prev.map((item) => (item.id === channel.id ? { ...item, ...patch } : item)))}
                    />
                  </section>

                  {/* 광고 */}
                  {channel.status === 'active' && (
                    <section className="space-y-3 rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
                      <h3 className="text-base font-bold text-foreground">홈 광고</h3>
                      {isPromotionActive(channel.isPromoted, channel.promotedUntil) && channel.promotedUntil && (
                        <p className="text-sm text-primary">노출 종료: {formatPromotedUntil(channel.promotedUntil)}</p>
                      )}
                      {channel.isPromoted && <AdClientDetail channel={channel} />}
                      <div className="flex flex-wrap gap-2">
                        <input type="date" value={promoteDates[channel.id] ?? defaultPromoteDateInput()} onChange={(e) => setPromoteDates((prev) => ({ ...prev, [channel.id]: e.target.value }))} className="h-11 rounded-xl bg-background px-3.5 text-[15px] text-foreground ring-1 ring-border" />
                        <button type="button" onClick={(e) => handleAddToAds(channel, e)} className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white">
                          {channel.isPromoted ? '광고 기간 변경' : '광고 추가하기'}
                        </button>
                      </div>
                    </section>
                  )}

                  {/* 활동 */}
                  <section className="space-y-3 rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
                    <h3 className="text-base font-bold text-foreground">활동</h3>
                    <div className="text-sm"><AdminChannelOpens channelId={channel.id} /></div>
                    <p className="text-sm text-subtle">
                      제보 보상은{' '}
                      <Link to="/admin/pending?tab=payout" className="font-semibold text-primary underline">제보·보상 화면</Link>
                      에서 지급해요.
                      {channel.rewardTonAmount != null && channel.rewardTonAmount > 0 ? ` (TON ${channel.rewardTonAmount} 기록됨)` : ''}
                    </p>
                  </section>
                </div>

                {/* 아래 고정 버튼 */}
                <div className="border-t border-border bg-card px-6 py-4">
                  {saveHint[channel.id] && <p className="mb-2 text-sm text-subtle">{saveHint[channel.id]}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void handleSaveDraft(channel)} className="h-11 rounded-xl bg-primary px-6 text-[15px] font-semibold text-white">저장</button>
                    <button type="button" disabled={collectingId === channel.id || (collectCooldownUntil[channel.id] ?? 0) > collectNow} onClick={() => void handleCollect(channel.id)} className="h-11 rounded-xl bg-muted px-5 text-[15px] font-semibold text-foreground disabled:opacity-50">
                      {collectButtonLabel(channel.id)}
                    </button>
                    {channel.status === 'pending' && (
                      <>
                        <button type="button" onClick={() => handleApprove(channel.id)} className="h-11 rounded-xl bg-success px-5 text-[15px] font-semibold text-white">승인</button>
                        <button type="button" onClick={() => handleReject(channel.id)} className="h-11 rounded-xl bg-muted px-5 text-[15px] font-semibold text-foreground">거절</button>
                      </>
                    )}
                    {channel.status === 'rejected' && (
                      <button type="button" onClick={() => handleApprove(channel.id)} className="h-11 rounded-xl bg-success px-5 text-[15px] font-semibold text-white">재승인</button>
                    )}
                    <button type="button" onClick={() => handleDelete(channel.id, channel.title)} className="ml-auto h-11 rounded-xl px-4 text-[15px] font-semibold text-destructive hover:bg-destructive/10">삭제</button>
                  </div>
                </div>
              </aside>
            </div>
          );
        })()}

        <div className="mt-4 flex items-center justify-between text-sm text-subtle">
          <span>총 {total}건 · {page}/{totalPages}페이지</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1} onClick={() => patchParams({ page: String(page - 1) })} className="rounded-lg bg-card px-3 py-1.5 ring-1 ring-border disabled:opacity-40">이전</button>
            <button type="button" disabled={page >= totalPages} onClick={() => patchParams({ page: String(page + 1) })} className="rounded-lg bg-card px-3 py-1.5 ring-1 ring-border disabled:opacity-40">다음</button>
          </div>
        </div>
      </div>
    </>
  );
}

function draftFromChannel(channel: PendingChannel): Draft {
  return {
    title: channel.title,
    titleLocked: Boolean(channel.titleLocked),
    language: channel.languageLocked ? (channel.language ?? 'unknown') : 'auto',
    category: channel.category,
    categoryLocked: Boolean(channel.categoryLocked),
    isVisible: channel.isVisible !== false,
    illegalCleared: Boolean(channel.illegalCleared),
  };
}
