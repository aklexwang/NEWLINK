import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  getAutoManageCandidates,
  getAutoManageCategories,
  getAutoManageStatus,
  lookupAdminChannel,
  publishAutoManageCandidates,
  skipAutoManageCandidates,
  syncAutoManageCandidates,
  type AdminChannelLookup,
  type AutoManageStatus,
  type ImportCandidate,
} from '../../api/admin';
import { AdminCategoryChipBar } from '../../components/admin/AdminCategoryChipBar';
import { CandidateAvatar } from '../../components/admin/CandidateAvatar';
import { ImportCandidatePreviewModal } from '../../components/admin/ImportCandidatePreviewModal';
import {
  AdminEmptyState,
  AdminMessage,
  AdminTable,
  AdminTableShell,
  AdminTd,
  AdminTh,
} from '../../components/admin/AdminTable';
import type { CategoryItem } from '../../types/categoryItem';
import { linkTypeBadgeClass, linkTypeLabel } from '../../utils/linkType';
import { isAdminAuthenticated } from '../../utils/adminAccess';

type StatusFilter = 'pending' | 'published' | 'skipped';

const statusTabs: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: '대기' },
  { value: 'published', label: '노출됨' },
  { value: 'skipped', label: '제외' },
];

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString('ko-KR');
}

export function AdminAutoManagePage() {
  const [status, setStatus] = useState<AutoManageStatus | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');
  const [previewCandidate, setPreviewCandidate] = useState<ImportCandidate | null>(null);
  const [previewLookup, setPreviewLookup] = useState<AdminChannelLookup | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusData, categoryItems, items] = await Promise.all([
        getAutoManageStatus(),
        getAutoManageCategories(),
        getAutoManageCandidates({
          status: statusFilter,
          category: categoryFilter || undefined,
        }),
      ]);
      setStatus(statusData);
      setCategories(
        categoryItems.map((item) => ({
          id: item.id,
          name: item.name,
          emoji: item.emoji,
          iconUrl: null,
          sortOrder: 0,
          isActive: true,
        })),
      );
      setCandidates(items);
      setSelected(new Set());
      setMessage('');
    } catch {
      setMessage('자동관리 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { '': candidates.length };
    for (const item of candidates) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [candidates]);

  const selectableIds = useMemo(
    () =>
      candidates
        .filter((item) => statusFilter === 'pending' && !item.alreadyOnMemberPage)
        .map((item) => item.id),
    [candidates, statusFilter],
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const handleSync = async () => {
    setSyncing(true);
    setMessage('');
    try {
      const result = await syncAutoManageCandidates(categoryFilter || undefined);
      setMessage(`동기화 완료 · 신규 ${result.created}건 · 갱신 ${result.updated}건`);
      await load();
    } catch (error) {
      if (!isAdminAuthenticated()) {
        setMessage('관리자 인증이 필요합니다. /admin?access=관리자키 로 먼저 접속해 주세요.');
      } else if (isAxiosError(error) && error.response?.status === 401) {
        setMessage('관리자 인증이 만료되었습니다. /admin?access=관리자키 로 다시 접속해 주세요.');
      } else if (isAxiosError(error) && !error.response) {
        setMessage('백엔드에 연결되지 않았습니다. PC 백엔드와 Cloudflare 터널이 켜져 있는지 확인해 주세요.');
      } else {
        setMessage('API 동기화에 실패했습니다. 백엔드와 ranking-seeds.json을 확인해 주세요.');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(selectableIds));
  };

  const handleToggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePublish = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setActing(true);
    try {
      const results = await publishAutoManageCandidates(ids);
      const okCount = results.filter((item) => item.ok).length;
      setMessage(`${okCount}건이 회원 랭킹 페이지에 노출되었습니다.`);
      await load();
    } catch {
      setMessage('노출 처리에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  const handleSkip = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setActing(true);
    try {
      await skipAutoManageCandidates(ids);
      setMessage(`${ids.length}건을 제외 목록으로 이동했습니다.`);
      await load();
    } catch {
      setMessage('제외 처리에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  const closePreview = () => {
    setPreviewCandidate(null);
    setPreviewLookup(null);
    setPreviewLoading(false);
  };

  const handleOpenPreview = async (item: ImportCandidate) => {
    setPreviewCandidate(item);
    setPreviewLookup(null);
    setPreviewLoading(true);
    try {
      const lookup = await lookupAdminChannel(item.link);
      setPreviewLookup(lookup);
    } catch {
      setMessage('미리보기 정보를 불러오지 못했습니다.');
      closePreview();
    } finally {
      setPreviewLoading(false);
    }
  };

  const handlePreviewPublish = async () => {
    if (!previewCandidate) return;
    setActing(true);
    try {
      const results = await publishAutoManageCandidates([previewCandidate.id]);
      if (results[0]?.ok) {
        setMessage(`"${previewCandidate.title}"이(가) 회원 랭킹 페이지에 노출되었습니다.`);
        closePreview();
        await load();
      } else {
        setMessage(results[0]?.message ?? '노출 처리에 실패했습니다.');
      }
    } catch {
      setMessage('노출 처리에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  const handlePreviewSkip = async () => {
    if (!previewCandidate) return;
    setActing(true);
    try {
      await skipAutoManageCandidates([previewCandidate.id]);
      setMessage(`"${previewCandidate.title}"을(를) 제외 목록으로 이동했습니다.`);
      closePreview();
      await load();
    } catch {
      setMessage('제외 처리에 실패했습니다.');
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">자동관리</h2>
            <p className="mt-1 text-sm text-slate-500">
              {status?.label ?? 'API/시드에서 후보를 가져와 선택 후 회원 페이지에 노출합니다.'}
            </p>
            {status?.hint && <p className="mt-1 text-xs text-slate-400">{status.hint}</p>}
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? '동기화 중...' : 'API 동기화'}
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && <AdminMessage message={message} />}

        <div className="mb-4 flex flex-wrap gap-2">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                statusFilter === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-black/10 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
          <AdminCategoryChipBar
            categories={categories}
            selected={categoryFilter}
            onSelect={setCategoryFilter}
            counts={categoryCounts}
          />
        )}

        {statusFilter === 'pending' && selectableIds.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePublish}
              disabled={acting || selected.size === 0}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              선택 항목 회원 페이지 노출 ({selected.size})
            </button>
            <button
              type="button"
              onClick={handleSkip}
              disabled={acting || selected.size === 0}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-black/10 hover:bg-slate-50 disabled:opacity-50"
            >
              선택 항목 제외
            </button>
          </div>
        )}

        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : candidates.length === 0 ? (
          <AdminEmptyState
            message={
              statusFilter === 'pending'
                ? '대기 중인 후보가 없습니다. API 동기화를 실행해 주세요.'
                : '표시할 항목이 없습니다.'
            }
          />
        ) : (
          <AdminTableShell>
            <AdminTable>
              <thead className="bg-slate-50">
                <tr>
                  {statusFilter === 'pending' && (
                    <AdminTh className="w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleToggleAll}
                        disabled={selectableIds.length === 0}
                      />
                    </AdminTh>
                  )}
                  <AdminTh className="w-12" />
                  <AdminTh>제목</AdminTh>
                  <AdminTh className="w-20">유형</AdminTh>
                  <AdminTh className="w-24">카테고리</AdminTh>
                  <AdminTh className="w-24">구독자</AdminTh>
                  <AdminTh className="w-20">소스</AdminTh>
                  <AdminTh className="w-24">미리보기</AdminTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {candidates.map((item) => {
                  const canSelect = statusFilter === 'pending' && !item.alreadyOnMemberPage;
                  return (
                    <tr key={item.id} className={item.alreadyOnMemberPage ? 'opacity-50' : ''}>
                      {statusFilter === 'pending' && (
                        <AdminTd>
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => handleToggle(item.id)}
                            disabled={!canSelect}
                          />
                        </AdminTd>
                      )}
                      <AdminTd>
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-100">
                          <CandidateAvatar
                            link={item.link}
                            avatarUrl={item.avatarUrl}
                            linkType={item.linkType}
                          />
                        </div>
                      </AdminTd>
                      <AdminTd>
                        <p className="max-w-[220px] truncate font-medium text-slate-900">{item.title}</p>
                        <p className="max-w-[220px] truncate text-xs text-slate-500">{item.link}</p>
                        {item.alreadyOnMemberPage && (
                          <span className="mt-1 inline-block rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                            이미 노출 중
                          </span>
                        )}
                      </AdminTd>
                      <AdminTd>
                        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(item.linkType)}`}>
                          {linkTypeLabel(item.linkType)}
                        </span>
                      </AdminTd>
                      <AdminTd><span className="text-xs">{item.category}</span></AdminTd>
                      <AdminTd><span className="text-xs tabular-nums">{formatCount(item.participantsCount)}</span></AdminTd>
                      <AdminTd><span className="text-xs uppercase text-slate-500">{item.source}</span></AdminTd>
                      <AdminTd>
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(item)}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                        >
                          열어보기
                        </button>
                      </AdminTd>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTable>
          </AdminTableShell>
        )}
      </div>

      <ImportCandidatePreviewModal
        candidate={previewCandidate}
        lookup={previewLookup}
        loading={previewLoading}
        acting={acting}
        onClose={closePreview}
        onPublish={handlePreviewPublish}
        onSkip={handlePreviewSkip}
      />
    </>
  );
}
