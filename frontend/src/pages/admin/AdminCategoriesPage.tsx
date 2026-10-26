import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  createCategory,
  deleteCategory,
  getAdminCategories,
  updateCategory,
} from '../../api/admin';
import { CategoryIcon } from '../../components/CategoryIcon';
import { AdminReclassifyPanel } from '../../components/admin/AdminReclassifyPanel';
import { AdminCategorySuggestions } from '../../components/admin/AdminCategorySuggestions';
import { getAdminCategoryCounts, recheckCategoryWithAi } from '../../api/notifications';
import { CategoryIconPicker } from '../../components/CategoryIconPicker';
import type { CategoryItem } from '../../types/categoryItem';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Card, CardContent } from '@/components/admin/ui/card';
import { Input } from '@/components/admin/ui/input';
import { Skeleton } from '@/components/admin/ui/skeleton';

type EditDraft = {
  name: string;
  emoji: string;
  iconUrl: string | null;
};

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newCategory, setNewCategory] = useState({
    name: '',
    emoji: '📁',
    iconUrl: null as string | null,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({
    name: '',
    emoji: '📁',
    iconUrl: null,
  });

  const [panel, setPanel] = useState<'reclassify' | 'suggest' | 'add' | null>(null);

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel]);

  const [counts, setCounts] = useState<Record<string, { total: number; visible: number }>>({});

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const [items, counts] = await Promise.all([
        getAdminCategories(),
        getAdminCategoryCounts().catch(() => ({})),
      ]);
      setCategories(items);
      setCounts(counts);
      setMessage('');
    } catch {
      setMessage('카테고리를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.name.trim()) return;
    try {
      await createCategory({
        name: newCategory.name.trim(),
        emoji: newCategory.emoji.trim() || '📁',
        iconUrl: newCategory.iconUrl,
        sortOrder: categories.length + 1,
      });
      setNewCategory({ name: '', emoji: '📁', iconUrl: null });
      setMessage('카테고리가 추가되었습니다.');
      await loadCategories();
    } catch {
      setMessage('카테고리 추가에 실패했습니다.');
    }
  };

  const startEdit = (item: CategoryItem) => {
    setEditingId(item.id);
    setEditDraft({
      name: item.name,
      emoji: item.emoji,
      iconUrl: item.iconUrl ?? null,
    });
  };

  const handleSaveEdit = async (id: string) => {
    const name = editDraft.name.trim();
    if (!name) {
      setMessage('카테고리 이름을 입력해 주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateCategory(id, {
        name,
        emoji: editDraft.emoji,
        iconUrl: editDraft.iconUrl,
      });
      setEditingId(null);
      setMessage('카테고리가 수정되었습니다.');
      await loadCategories();
    } catch (error) {
      const apiMessage =
        isAxiosError(error) && typeof error.response?.data?.message === 'string'
          ? error.response.data.message
          : null;
      setMessage(apiMessage || '카테고리 수정에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: CategoryItem) => {
    await updateCategory(item.id, { isActive: !item.isActive });
    setMessage(item.isActive ? '카테고리를 비활성화했습니다.' : '카테고리를 활성화했습니다.');
    await loadCategories();
  };

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // 분류대기는 시스템이 쓰는 칸이라 지우지 않는다
  const deletable = categories.filter((item) => item.name !== '분류대기');
  const emptyIds = deletable
    .filter((item) => (counts[item.name]?.total ?? 0) === 0)
    .map((item) => item.id);

  // 등록된 방이 많은 카테고리부터 (분류대기는 맨 위)
  // 분류대기는 시스템 칸이라 목록에서 감추고 위에 숫자만 보여 준다
  const pendingTotal = counts['분류대기']?.total ?? 0;
  const sortedCategories = [...categories].filter((item) => item.name !== '분류대기').sort((a, b) => {
    return (
      (counts[b.name]?.total ?? 0) - (counts[a.name]?.total ?? 0) ||
      a.name.localeCompare(b.name, 'ko')
    );
  });

  const [recheck, setRecheck] = useState<{
    name: string;
    busy: boolean;
    result?: { total: number; changed: Array<{ title: string; from: string; to: string }> };
  } | null>(null);

  const handleRecheck = async (name: string) => {
    const total = counts[name]?.total ?? 0;
    if (
      !window.confirm(
        `"${name}" 카테고리 방 ${total}개를 AI로 다시 확인할까요?\n방 하나에 AI 1번(소액 과금)이고, 잘못 들어간 방은 맞는 카테고리로 옮겨져요.\n직접 고정한 방은 그대로 둬요.`,
      )
    )
      return;
    setRecheck({ name, busy: true });
    try {
      const result = await recheckCategoryWithAi(name);
      setRecheck({ name, busy: false, result });
      await loadCategories();
    } catch {
      setRecheck(null);
      setMessage('AI 재확인에 실패했어요. 잠시 뒤 다시 해 주세요.');
    }
  };

  const handleBulkDelete = async () => {
    const targets = categories.filter((item) => selectedIds.has(item.id));
    if (targets.length === 0) return;
    const withRooms = targets.filter((item) => (counts[item.name]?.total ?? 0) > 0);
    const lines = [
      `카테고리 ${targets.length}개를 삭제할까요?`,
      '',
      targets.map((item) => item.name).join(', '),
    ];
    if (withRooms.length > 0) {
      lines.push(
        '',
        `⚠ 이 중 ${withRooms.length}개(${withRooms.map((item) => item.name).join(', ')})에는 방이 있어요.`,
        '삭제해도 방은 지워지지 않지만 카테고리 이름만 남아요. 먼저 다른 카테고리로 옮기는 걸 권해요.',
      );
    }
    if (!window.confirm(lines.join('\n'))) return;
    setSaving(true);
    let done = 0;
    for (const item of targets) {
      try {
        await deleteCategory(item.id);
        done += 1;
      } catch {
        /* 하나 실패해도 나머지는 계속 */
      }
    }
    setSaving(false);
    setSelectedIds(new Set());
    setMessage(`카테고리 ${done}개를 삭제했어요.${done < targets.length ? ` (${targets.length - done}개 실패)` : ''}`);
    await loadCategories();
  };

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('이 카테고리를 삭제할까요?')) return;
    await deleteCategory(id);
    setMessage('카테고리가 삭제되었습니다.');
    await loadCategories();
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <p className="mt-1 text-sm text-muted-foreground">
        이름·아이콘을 관리합니다. 회원 화면 카테고리 목록은 방 많은 순으로 나오고, 방이 0개인 카테고리는 숨겨져요.
      </p>
      {message && <p className="mt-3 text-sm text-foreground">{message}</p>}

      <div className="mt-6 grid max-w-5xl gap-3 md:grid-cols-3">
        {(
          [
            { id: 'reclassify', label: '🤖 전체 재분류 (AI)', desc: '모든 방 카테고리를 AI로 다시 점검' },
            { id: 'suggest', label: '💡 새 카테고리 후보', desc: 'AI가 제안한 새 이름 보기·옮기기' },
            { id: 'add', label: '➕ 새 카테고리 추가', desc: '이름·아이콘 정해서 직접 추가' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPanel(item.id)}
            className="rounded-2xl bg-card px-5 py-4 text-left shadow-[var(--hz-shadow)] transition-colors hover:bg-muted"
          >
            <p className="text-[17px] font-bold text-foreground">{item.label}</p>
            <p className="mt-1 text-sm text-subtle">{item.desc}</p>
          </button>
        ))}
      </div>

      {panel && (
        <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
          <button type="button" aria-label="닫기" className="absolute inset-0 bg-black/40" onClick={() => setPanel(null)} />
          <aside className="relative flex h-full w-full max-w-[760px] flex-col bg-background shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border bg-card px-6 py-5">
              <p className="flex-1 text-xl font-bold text-foreground">
                {panel === 'reclassify' ? '🤖 전체 재분류 (AI)' : panel === 'suggest' ? '💡 새 카테고리 후보' : '➕ 새 카테고리 추가'}
              </p>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="h-10 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground"
              >
                닫기 ✕
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {panel === 'reclassify' && <AdminReclassifyPanel />}
              {panel === 'suggest' && (
                <AdminCategorySuggestions
                  existingNames={categories.map((item) => item.name)}
                  onCategoryCreated={() => void loadCategories()}
                />
              )}
              {panel === 'add' && (
                <div className="rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
                  {message && <p className="mb-3 text-sm text-foreground">{message}</p>}
              <form onSubmit={handleCreateCategory} className="flex flex-col gap-3">
                <Input
                  required
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  placeholder="카테고리 이름 (예: 게임)"
                />
                <CategoryIconPicker
                  emoji={newCategory.emoji}
                  iconUrl={newCategory.iconUrl}
                  onEmojiChange={(emoji) => setNewCategory({ ...newCategory, emoji })}
                  onIconUrlChange={(iconUrl) => setNewCategory({ ...newCategory, iconUrl })}
                />
                <Button type="submit">카테고리 추가</Button>
              </form>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {loading ? (
        <Skeleton className="mt-6 h-32 w-full max-w-3xl" />
      ) : (
        <div className="mt-6 flex max-w-3xl flex-col gap-3">
          {recheck && (
            <div className="rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)] ring-2 ring-primary/30">
              <div className="flex items-center gap-3">
                <p className="flex-1 text-base font-bold text-foreground">
                  🤖 "{recheck.name}" AI 재확인
                  {recheck.busy
                    ? ' — 확인 중이에요 (방 하나에 몇 초씩 걸려요)…'
                    : ` — ${recheck.result?.total ?? 0}개 중 ${recheck.result?.changed.length ?? 0}개 옮김`}
                </p>
                {!recheck.busy && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setRecheck(null)}>
                    닫기
                  </Button>
                )}
              </div>
              {!recheck.busy && (recheck.result?.changed.length ?? 0) > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {recheck.result!.changed.map((row) => (
                    <li key={row.title} className="text-foreground">
                      {row.title} : <span className="text-subtle">{row.from}</span> →{' '}
                      <b className="text-primary">{row.to}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl bg-card p-4 shadow-[var(--hz-shadow)]">
            <div className="mr-auto">
              <h3 className="text-base font-bold">등록된 카테고리 ({sortedCategories.length})</h3>
              {pendingTotal > 0 && (
                <p className="mt-0.5 text-xs text-subtle">
                  ⏳ 분류대기 {pendingTotal.toLocaleString()}개 — 매주 월요일 새벽 AI가 자동으로 카테고리를 정해요
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={emptyIds.length === 0}
              onClick={() => setSelectedIds(new Set(emptyIds))}
            >
              방 0개 모두 선택 ({emptyIds.length})
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setSelectedIds((prev) =>
                  prev.size === deletable.length ? new Set() : new Set(deletable.map((item) => item.id)),
                )
              }
            >
              {selectedIds.size === deletable.length && deletable.length > 0 ? '선택 해제' : '전체 선택'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={saving || selectedIds.size === 0}
              onClick={() => void handleBulkDelete()}
            >
              선택 삭제 ({selectedIds.size})
            </Button>
          </div>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 카테고리가 없습니다.</p>
          ) : (
            sortedCategories.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    aria-label={`${item.name} 선택`}
                    className="h-5 w-5 cursor-pointer accent-[var(--hz-primary,#4318ff)] disabled:cursor-not-allowed disabled:opacity-30"
                    disabled={item.name === '분류대기'}
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelected(item.id)}
                  />
                  <CategoryIcon emoji={item.emoji} iconUrl={item.iconUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.isActive ? '활성' : '비활성'}
                    </p>
                    {(() => {
                      const c = counts[item.name] ?? { total: 0, visible: 0 };
                      return (
                        <p
                          className={`mt-1 text-sm font-semibold ${
                            c.visible === 0 ? 'text-destructive' : 'text-foreground'
                          }`}
                        >
                          회원 화면 {c.visible.toLocaleString()}개 · 등록 {c.total.toLocaleString()}개
                          {c.total === 0 && ' — 방이 없어 회원 화면 목록에 안 나와요'}
                          {c.total > 0 &&
                            c.visible === 0 &&
                            ' — 방은 있지만 모두 숨김(외국어·불법 의심 등)이라 회원 화면에 안 나와요'}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={recheck?.busy === true || (counts[item.name]?.total ?? 0) === 0}
                      onClick={() => void handleRecheck(item.name)}
                    >
                      {recheck?.busy && recheck.name === item.name ? 'AI 확인 중…' : 'AI 재확인'}
                    </Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(item)}>
                      수정
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void handleToggleActive(item)}>
                      {item.isActive ? '끄기' : '켜기'}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleDeleteCategory(item.id)}
                    >
                      삭제
                    </Button>
                  </div>
                  {!item.isActive && <Badge variant="secondary">비활성</Badge>}
                </CardContent>
                {editingId === item.id && (
                  <CardContent className="space-y-3 border-t border-border pt-4">
                    <label className="block text-xs font-medium">
                      이름
                      <Input
                        className="mt-1"
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      />
                    </label>
                    <CategoryIconPicker
                      emoji={editDraft.emoji}
                      iconUrl={editDraft.iconUrl}
                      onEmojiChange={(emoji) => setEditDraft({ ...editDraft, emoji })}
                      onIconUrlChange={(iconUrl) => setEditDraft({ ...editDraft, iconUrl })}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSaveEdit(item.id)}
                      >
                        {saving ? '저장 중...' : '저장'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={saving}
                        onClick={() => setEditingId(null)}
                      >
                        취소
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
