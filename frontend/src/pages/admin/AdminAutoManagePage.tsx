import { useCallback, useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  getAdminCategories,
  getAutoManageCandidates,
  getAutoManageCategories,
  getAutoManageStatus,
  lookupAdminChannel,
  publishAutoManageCandidates,
  searchGoogleAutoManageCandidates,
  skipAutoManageCandidates,
  syncAutoManageCandidates,
  type AdminChannelLookup,
  type AutoManageStatus,
  type GoogleSearchPreset,
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

const googlePresets: { value: GoogleSearchPreset; label: string; hint: string }[] = [
  { value: 'site', label: 'site:t.me', hint: '공개 채널·그룹 링크' },
  { value: 'groups', label: '그룹 위주', hint: '-channel 필터' },
  { value: 'intitle', label: '제목 검색', hint: 'intitle' },
  { value: 'invite', label: '초대 링크', hint: 'joinchat / +' },
  { value: 'directory', label: '디렉터리', hint: '블로그·포럼' },
  { value: 'custom', label: '직접 입력', hint: '연산자 자유' },
];

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString('ko-KR');
}

export function AdminAutoManagePage() {
  const [status, setStatus] = useState<AutoManageStatus | null>(null);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [allCategories, setAllCategories] = useState<CategoryItem[]>([]);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchingGoogle, setSearchingGoogle] = useState(false);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');
  const [previewCandidate, setPreviewCandidate] = useState<ImportCandidate | null>(null);
  const [previewLookup, setPreviewLookup] = useState<AdminChannelLookup | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [googleTopic, setGoogleTopic] = useState('');
  const [googlePreset, setGooglePreset] = useState<GoogleSearchPreset>('site');
  const [googleCustomQuery, setGoogleCustomQuery] = useState('');
  const [googleCategory, setGoogleCategory] = useState('기타');
  const [googlePages, setGooglePages] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusData, categoryItems, items, adminCats] = await Promise.all([
        getAutoManageStatus(),
        getAutoManageCategories(),
        getAutoManageCandidates({
          status: statusFilter,
          category: categoryFilter || undefined,
        }),
        getAdminCategories().catch(() => [] as CategoryItem[]),
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
      setAllCategories(adminCats.filter((item) => item.isActive !== false));
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

  useEffect(() => {
    if (allCategories.length === 0) return;
    if (!allCategories.some((item) => item.name === googleCategory)) {
      setGoogleCategory(allCategories[0]?.name ?? '기타');
    }
  }, [allCategories, googleCategory]);

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
      const categoryCount = result.categoriesSynced?.length ?? 0;
      const skipped = (result.skippedNonKorean ?? 0) + (result.cleanedNonKorean ?? 0);
      setMessage(
        `동기화 완료 · 신규 ${result.created}건 · 갱신 ${result.updated}건` +
          (categoryCount > 0 ? ` · ${categoryCount}개 카테고리` : '') +
          ` · 수집 ${result.total}건` +
          (skipped > 0 ? ` · 비한글 제외 ${skipped}건` : ''),
      );
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

  const handleGoogleSearch = async () => {
    if (googlePreset === 'custom' && !googleCustomQuery.trim()) {
      setMessage('커스텀 쿼리를 입력해 주세요.');
      return;
    }
    if (googlePreset !== 'custom' && !googleTopic.trim()) {
      setMessage('검색 주제를 입력해 주세요.');
      return;
    }
    if (!googleCategory.trim()) {
      setMessage('저장할 카테고리를 선택해 주세요.');
      return;
    }

    setSearchingGoogle(true);
    setMessage('');
    try {
      const result = await searchGoogleAutoManageCandidates({
        topic: googleTopic.trim() || undefined,
        preset: googlePreset,
        customQuery: googlePreset === 'custom' ? googleCustomQuery.trim() : undefined,
        category: googleCategory,
        pages: googlePages,
      });
      setMessage(
        `Google 검색 완료 · 쿼리: ${result.query}` +
          ` · 링크 ${result.total}건 (공개 ${result.publicCount} · 초대 ${result.inviteCount})` +
          ` · 신규 ${result.created} · 갱신 ${result.updated}` +
          (result.skippedExisting > 0 ? ` · 기존/제외 ${result.skippedExisting}` : ''),
      );
      setStatusFilter('pending');
      await load();
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 503) {
        setMessage(
          typeof error.response.data?.message === 'string'
            ? error.response.data.message
            : 'Google CSE가 설정되지 않았거나 호출에 실패했습니다.',
        );
      } else if (!isAdminAuthenticated()) {
        setMessage('관리자 인증이 필요합니다. /admin?access=관리자키 로 먼저 접속해 주세요.');
      } else {
        setMessage('Google 검색 수집에 실패했습니다.');
      }
    } finally {
      setSearchingGoogle(false);
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

        <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Google 검색 수집</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                주제를 입력하면 site:t.me 연산자로 공개·초대(joinchat/+) 링크를 모아 후보에 넣습니다.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                status?.googleConfigured
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {status?.googleConfigured ? 'CSE 연결됨' : 'CSE 미설정'}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {googlePresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setGooglePreset(preset.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  googlePreset === preset.value
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title={preset.hint}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {googlePreset === 'custom' ? (
              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-slate-600">커스텀 쿼리</span>
                <input
                  value={googleCustomQuery}
                  onChange={(e) => setGoogleCustomQuery(e.target.value)}
                  placeholder='예: site:t.me "python" -channel'
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </label>
            ) : (
              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-slate-600">주제 (자유 입력)</span>
                <input
                  value={googleTopic}
                  onChange={(e) => setGoogleTopic(e.target.value)}
                  placeholder="예: python programming / 암호화폐"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              </label>
            )}

            <label className="block">
              <span className="text-xs font-medium text-slate-600">저장 카테고리</span>
              <select
                value={googleCategory}
                onChange={(e) => setGoogleCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              >
                {(allCategories.length > 0
                  ? allCategories
                  : [{ id: '기타', name: '기타', emoji: '📁' } as CategoryItem]
                ).map((item) => (
                  <option key={item.id || item.name} value={item.name}>
                    {item.emoji ? `${item.emoji} ` : ''}
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">검색 페이지 수 (×10)</span>
              <select
                value={googlePages}
                onChange={(e) => setGooglePages(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}페이지 (최대 {n * 10}건)
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGoogleSearch}
              disabled={searchingGoogle || status?.googleConfigured === false}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {searchingGoogle ? '검색 중...' : 'Google 검색 → 후보 추가'}
            </button>
            {status?.googleConfigured === false && (
              <p className="text-xs text-amber-700">
                backend .env에 GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX를 설정한 뒤 Nest를 재시작하세요.
              </p>
            )}
          </div>
        </section>

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
                ? '대기 중인 후보가 없습니다. API 동기화 또는 Google 검색을 실행해 주세요.'
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
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(item.linkType)}`}
                        >
                          {linkTypeLabel(item.linkType)}
                        </span>
                      </AdminTd>
                      <AdminTd>
                        <span className="text-xs">{item.category}</span>
                      </AdminTd>
                      <AdminTd>
                        <span className="text-xs tabular-nums">{formatCount(item.participantsCount)}</span>
                      </AdminTd>
                      <AdminTd>
                        <span className="text-xs uppercase text-slate-500">{item.source}</span>
                      </AdminTd>
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
