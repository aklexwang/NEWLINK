import { useCallback, useEffect, useState } from 'react';
import {
  createDiscoveryKeyword,
  deleteDiscoveryKeyword,
  discardDiscoveryUsernames,
  getAdminCategories,
  getDiscoveryKeywords,
  getDiscoveryQueue,
  getDiscoveryUsage,
  registerDiscoveryUsernames,
  reorderDiscoveryKeywords,
  updateDiscoveryKeyword,
  type DiscoveryKeywordRow,
  type DiscoveryQueueFilter,
  type DiscoveryQueueItem,
  type DiscoveryUsage,
} from '../../api/admin';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import type { CategoryItem } from '../../types/categoryItem';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/admin/ui/card';
import { Checkbox } from '@/components/admin/ui/checkbox';
import { Input } from '@/components/admin/ui/input';
import { Skeleton } from '@/components/admin/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/admin/ui/tabs';

const FILTERS: { value: DiscoveryQueueFilter; label: string }[] = [
  { value: 'queued', label: '대기' },
  { value: 'added', label: '등록됨' },
  { value: 'not_korean', label: '외국어' },
  { value: 'too_small', label: '100명 미만' },
  { value: 'not_found', label: '없는 채널' },
  { value: 'invite_or_private', label: '초대·비공개' },
  { value: 'all', label: '전체' },
];

function formatKst(value: string | null | undefined): string {
  if (!value) return '-';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '-';
  return at.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

export function AdminDiscoveryPage() {
  const [filter, setFilter] = useState<DiscoveryQueueFilter>('queued');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [items, setItems] = useState<DiscoveryQueueItem[]>([]);
  const [usage, setUsage] = useState<DiscoveryUsage | null>(null);
  const [keywords, setKeywords] = useState<DiscoveryKeywordRow[]>([]);
  const [keywordSort, setKeywordSort] = useState<'sort' | 'new'>('sort');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [category, setCategory] = useState('');
  const [newWord, setNewWord] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, nextUsage, nextKeywords, adminCats] = await Promise.all([
        getDiscoveryQueue({
          filter,
          source: source || undefined,
          page,
        }),
        getDiscoveryUsage(),
        getDiscoveryKeywords(keywordSort === 'new' ? 'new' : undefined),
        getAdminCategories().catch(() => [] as CategoryItem[]),
      ]);
      setItems(queue.items);
      setTotal(queue.total);
      setPageSize(queue.pageSize);
      setUsage(nextUsage);
      setKeywords(nextKeywords);
      setCategories(adminCats.filter((item) => item.isActive));
      setSelected(new Set());
      setMessage('');
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '발견 목록을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [filter, source, page, keywordSort]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (username: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(username);
      else next.delete(username);
      return next;
    });
  };

  const registerSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm('탈락 후보도 등록할 수 있습니다. 선택한 항목을 등록할까요?')) return;
    setActing(true);
    try {
      const { results } = await registerDiscoveryUsernames({
        usernames: [...selected],
        category: category || undefined,
      });
      const ok = results.filter((row) => row.ok).length;
      setMessage(`${ok}개 등록, ${results.length - ok}개는 건너뛰었습니다.`);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '등록에 실패했습니다.'));
    } finally {
      setActing(false);
    }
  };

  const discardSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm('선택한 항목을 버리고 다시 검사하지 않을까요?')) return;
    setActing(true);
    try {
      await discardDiscoveryUsernames([...selected]);
      setMessage(`${selected.size}개를 버렸습니다.`);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '버리기에 실패했습니다.'));
    } finally {
      setActing(false);
    }
  };

  const addKeyword = async () => {
    if (!newWord.trim()) return;
    setActing(true);
    try {
      await createDiscoveryKeyword({ word: newWord.trim() });
      setNewWord('');
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '키워드를 추가하지 못했습니다.'));
    } finally {
      setActing(false);
    }
  };

  const moveKeyword = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= keywords.length) return;
    const ids = keywords.map((row) => row.id);
    const tmp = ids[index];
    ids[index] = ids[next];
    ids[next] = tmp;
    setActing(true);
    try {
      setKeywords(await reorderDiscoveryKeywords(ids));
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '순서를 바꾸지 못했습니다.'));
    } finally {
      setActing(false);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="text-xl font-bold">발견</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        서버가 모아 둔 대기열입니다. 이 화면의 새로고침은 조회만 하며 MTProto를 부르지 않습니다.
      </p>
      {message && <p className="mt-3 text-sm text-destructive">{message}</p>}

      {usage ? (
        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>발견 오늘</CardDescription>
              <CardTitle>
                {usage.snowball.today}/{usage.snowball.dailyMax}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>키워드 검색</CardDescription>
              <CardTitle>
                {usage.keywordSearch.today}/{usage.keywordSearch.dailyMax}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription>resolve</CardDescription>
              <CardTitle>
                {usage.resolve.today}/{usage.resolve.dailyMax}
              </CardTitle>
            </CardHeader>
          </Card>
        </section>
      ) : (
        <Skeleton className="mt-6 h-24 w-full" />
      )}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <Tabs
          value={filter}
          onValueChange={(value) => {
            setFilter(value as DiscoveryQueueFilter);
            setPage(1);
          }}
        >
          <TabsList className="flex-wrap">
            {FILTERS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">출처 전체</option>
          <option value="snowball">snowball</option>
          <option value="keyword">keyword</option>
          <option value="other">기타</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">분류 자동</option>
          {categories.map((item) => (
            <option key={item.id} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          새로고침
        </Button>
        <Button type="button" disabled={acting || selected.size === 0} onClick={() => void registerSelected()}>
          그래도 등록 ({selected.size})
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={acting || selected.size === 0}
          onClick={() => void discardSelected()}
        >
          버리기
        </Button>
      </div>

      <Card className="mt-4 py-0">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">선택</TableHead>
                <TableHead>아이디</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>구독자</TableHead>
                <TableHead>출처</TableHead>
                <TableHead>찾은 날짜</TableHead>
                <TableHead>결과</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    항목이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.username}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(item.username)}
                        onCheckedChange={(value) => toggle(item.username, value === true)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">@{item.username}</TableCell>
                    <TableCell>{item.title ?? '-'}</TableCell>
                    <TableCell>{item.memberCount ?? '-'}</TableCell>
                    <TableCell>{item.sourceLabel}</TableCell>
                    <TableCell className="text-xs">{formatKst(item.checkedAt)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.resultLabel}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          이전
        </Button>
        <span>
          {page}/{pageCount} · {total}건
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => setPage((p) => p + 1)}
        >
          다음
        </Button>
      </div>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">키워드</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setKeywordSort((prev) => (prev === 'new' ? 'sort' : 'new'))}
          >
            {keywordSort === 'new' ? '순서대로' : '누적 신규 많은 순'}
          </Button>
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="키워드 추가"
            className="max-w-xs"
          />
          <Button type="button" disabled={acting || !newWord.trim()} onClick={() => void addKeyword()}>
            추가
          </Button>
        </div>
        <Card className="mt-4 py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>키워드</TableHead>
                <TableHead>분류</TableHead>
                <TableHead>사용</TableHead>
                <TableHead>마지막 검색</TableHead>
                <TableHead>찾은 수</TableHead>
                <TableHead>누적 신규</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keywords.map((row, index) => (
                <TableRow key={row.id}>
                  <TableCell>{row.word}</TableCell>
                  <TableCell>{row.category ?? '-'}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={row.enabled}
                      onCheckedChange={(value) => {
                        void updateDiscoveryKeyword(row.id, { enabled: value === true }).then(
                          () => load(),
                          (error) => setMessage(adminApiErrorMessage(error, '키워드를 바꾸지 못했습니다.')),
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-xs">{formatKst(row.lastSearchedAt)}</TableCell>
                  <TableCell>{row.lastFoundCount ?? '-'}</TableCell>
                  <TableCell>{row.totalNewCount}</TableCell>
                  <TableCell className="space-x-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={keywordSort === 'new'}
                      onClick={() => void moveKeyword(index, -1)}
                    >
                      위
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={keywordSort === 'new'}
                      onClick={() => void moveKeyword(index, 1)}
                    >
                      아래
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (!window.confirm('이 키워드를 삭제할까요?')) return;
                        void deleteDiscoveryKeyword(row.id).then(
                          () => load(),
                          (error) => setMessage(adminApiErrorMessage(error, '삭제하지 못했습니다.')),
                        );
                      }}
                    >
                      삭제
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>

      {/* 예전 Google·TGStat·시드 동기화 UI는 AdminAutoManagePage 에 그대로 둠. 라우트만 발견 화면으로 바꿈. */}
    </div>
  );
}
