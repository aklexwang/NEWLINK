import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { AdClientDetail } from '../../components/admin/AdClientInfo';
import { AdminChannelOpens } from '../../components/admin/AdminChannelOpens';
import { ChannelAvatarEditor } from '../../components/admin/ChannelAvatarEditor';
import { ChannelQuickPreview } from '../../components/admin/ChannelQuickPreview';
import {
  AdminEmptyState,
  AdminMessage,
  ChannelAvatar,
} from '../../components/admin/AdminTable';
import type { Channel, PendingChannel } from '../../types/channel';
import type { CategoryItem } from '../../types/categoryItem';
import { refreshAdminBadges } from '../../utils/adminBadges';
import { linkTypeLabel } from '../../utils/linkType';
import { AdminDatePicker } from '../../components/admin/AdminDatePicker';
import { todayKstYmd } from '../../utils/ymd';
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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    // silent: 목록을 지우지 않고 뒤에서 새로 받기 (화면이 위로 튀지 않게)
    if (!opts?.silent) setLoading(true);
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const drawerChannel = expandedId ? (channels.find((item) => item.id === expandedId) ?? null) : null;
  const categoryOptions = categories.map((c) => c.name);

  // 왼쪽 목록에서 고른 방 (오른쪽 편집)
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedChannel = channels.find((c) => c.id === focusedId) ?? channels[0] ?? null;

  // 오른쪽 편집 칸을 고른 방 줄 높이에 맞춰 내린다 (목록 아래로는 넘치지 않게)
  const splitRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [panelTop, setPanelTop] = useState(0);
  useLayoutEffect(() => {
    const row = focusedChannel ? rowRefs.current.get(focusedChannel.id) : null;
    const list = listRef.current;
    const panel = panelRef.current;
    if (!row || !list || !panel) return;
    const listHeight = list.offsetHeight;
    const panelHeight = panel.offsetHeight;
    const wanted = row.offsetTop;
    const next = Math.max(0, Math.min(wanted, Math.max(0, listHeight - panelHeight)));
    setPanelTop((prev) => (prev === next ? prev : next));
  }, [focusedChannel, channels]);

  const moveFocus = useCallback(
    (delta: number) => {
      if (channels.length === 0) return;
      const index = Math.max(0, channels.findIndex((c) => c.id === focusedChannel?.id));
      const next = channels[Math.min(channels.length - 1, Math.max(0, index + delta))];
      if (next) setFocusedId(next.id);
    },
    [channels, focusedChannel],
  );

  // ↑↓ 키로 방 이동 (글 입력 중에는 동작 안 함)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || expandedId) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveFocus(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveFocus(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveFocus, expandedId]);

  /** 카테고리 고르고 다음 방으로 */
  const pickCategoryAndNext = async (channel: { id: string; title: string; category: string }, name: string) => {
    if (name === channel.category) {
      moveFocus(1);
      return;
    }
    const index = channels.findIndex((c) => c.id === channel.id);
    const nextId = channels[index + 1]?.id ?? null;
    await moveCategory(channel, name);
    if (nextId) setFocusedId(nextId);
  };

  const moveCategory = async (channel: { id: string; title: string; category: string }, next: string) => {
    try {
      await updateAdminChannel(channel.id, { category: next, categoryLocked: true });
      setMessage(`"${channel.title}" 카테고리를 ${channel.category} → ${next}(으)로 옮겼어요. (고정됨)`);
      // 바로 화면에 반영하고, 노출 여부 등은 뒤에서 다시 받는다
      setChannels((prev) => prev.map((c) => (c.id === channel.id ? { ...c, category: next } : c)));
      void load({ silent: true });
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '카테고리를 옮기지 못했습니다.'));
    }
  };

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
          <div ref={splitRef} className="relative flex items-start gap-4">
            {/* 왼쪽: 방 목록 (누르면 오른쪽에서 카테고리 정하기, ↑↓ 키로 이동) */}
            <div ref={listRef} className="w-1/2 min-w-0 space-y-1.5">
              {channels.map((channel) => {
                const focused = focusedChannel?.id === channel.id;
                const pending = channel.category === '분류대기';
                return (
                  <div
                    key={channel.id}
                    ref={(el) => {
                      if (el) rowRefs.current.set(channel.id, el);
                      else rowRefs.current.delete(channel.id);
                    }}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFocusedId(channel.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setFocusedId(channel.id);
                    }}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${
                      focused ? 'bg-primary/10 ring-2 ring-primary' : 'bg-card hover:bg-muted'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={selectedIds.has(channel.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(channel.id)) next.delete(channel.id);
                          else next.add(channel.id);
                          return next;
                        });
                      }}
                    />
                    <ChannelAvatar channel={channel} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-semibold text-foreground">{channel.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {channel.username ? `@${channel.username}` : '비공개 초대방'} · {linkTypeLabel(channel.linkType)} ·{' '}
                        {channel.memberCount != null ? `${Number(channel.memberCount).toLocaleString()}명` : '회원 -'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold ${
                        pending ? 'bg-amber-100 text-amber-800' : 'bg-muted text-foreground'
                      }`}
                    >
                      {channel.category}
                    </span>
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${channel.memberPageVisible ? 'bg-green-500' : 'bg-amber-500'}`}
                      title={channel.memberPageVisible ? '회원 화면 노출 중' : '회원 화면 숨김'}
                    />
                  </div>
                );
              })}
            </div>

            {/* 오른쪽: 고른 방 편집 (화면을 내려도 따라옴) */}
            <div
              ref={panelRef}
              className="w-1/2 min-w-0 transition-[margin] duration-200"
              style={{ marginTop: panelTop }}
            >
              {focusedChannel ? (
                <div className="rounded-2xl bg-card p-6 shadow-[var(--hz-shadow)]">
                  <div className="flex items-start gap-4">
                    <div className="scale-125 pt-1">
                      <ChannelAvatar channel={focusedChannel} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xl font-bold text-foreground">{focusedChannel.title}</p>
                      <p className="mt-1 text-sm text-subtle">
                        {focusedChannel.username ? `@${focusedChannel.username}` : '비공개 초대방'} ·{' '}
                        {linkTypeLabel(focusedChannel.linkType)} · 회원{' '}
                        {focusedChannel.memberCount != null ? Number(focusedChannel.memberCount).toLocaleString() : '-'}
                      </p>
                      <p className="mt-2 text-sm font-semibold">
                        {focusedChannel.memberPageVisible ? (
                          <span className="text-green-600">● 회원 화면 노출 중</span>
                        ) : (
                          <span className="text-amber-600">
                            ● 회원 화면 숨김 · {focusedChannel.memberPageReasonKey || focusedChannel.memberPageHiddenReason || '숨김'}
                          </span>
                        )}
                      </p>
                    </div>
                    <a
                      href={focusedChannel.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-2 rounded-xl bg-[#2AABEE] px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-90"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                        <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
                      </svg>
                      텔레그램에서 열기
                    </a>
                  </div>

                  <ChannelQuickPreview channelId={focusedChannel.id} />

                  <p className="mt-6 text-sm font-semibold text-subtle">
                    카테고리 고르기 <span className="font-normal">(누르면 바로 저장·고정되고 다음 방으로 넘어가요)</span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {categories
                      .filter((c) => c.isActive && c.name !== '분류대기')
                      .map((c) => {
                        const on = focusedChannel.category === c.name;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => void pickCategoryAndNext(focusedChannel, c.name)}
                            className={`h-11 rounded-xl px-4 text-[14px] font-bold transition-colors ${
                              on ? 'bg-green-500 text-white' : 'bg-muted text-foreground hover:bg-primary/15'
                            }`}
                          >
                            {c.emoji} {c.name}
                          </button>
                        );
                      })}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
                    <button type="button" onClick={() => moveFocus(-1)} className="h-10 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground">
                      ↑ 이전 방
                    </button>
                    <button type="button" onClick={() => moveFocus(1)} className="h-10 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground">
                      다음 방 ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDrafts((prev) => (prev[focusedChannel.id] ? prev : { ...prev, [focusedChannel.id]: draftFromChannel(focusedChannel) }));
                        setExpandedId(focusedChannel.id);
                      }}
                      className="ml-auto h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
                    >
                      자세히 편집 (이름·노출·광고 등)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground shadow-[var(--hz-shadow)]">
                  왼쪽에서 방을 고르세요.
                </div>
              )}
            </div>
          </div>
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

                  {/* 광고: 지금 광고 중인 방만 */}
                  {channel.status === 'active' && isPromotionActive(channel.isPromoted, channel.promotedUntil) && (
                    <section className="space-y-3 rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
                      <h3 className="text-base font-bold text-foreground">홈 광고</h3>
                      {isPromotionActive(channel.isPromoted, channel.promotedUntil) && channel.promotedUntil && (
                        <p className="text-sm text-primary">노출 종료: {formatPromotedUntil(channel.promotedUntil)}</p>
                      )}
                      {channel.isPromoted && <AdClientDetail channel={channel} />}
                      <div className="flex flex-wrap gap-2">
                        <AdminDatePicker className="min-w-[230px]" clearable={false} min={todayKstYmd()} value={promoteDates[channel.id] ?? defaultPromoteDateInput()} onChange={(value) => setPromoteDates((prev) => ({ ...prev, [channel.id]: value }))} />
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
