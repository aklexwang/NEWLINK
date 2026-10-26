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
import { getAdminCategoryCounts } from '../../api/notifications';
import { CategoryIconPicker } from '../../components/CategoryIconPicker';
import type { CategoryItem } from '../../types/categoryItem';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card';
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
  const sortedCategories = [...categories].sort((a, b) => {
    if (a.name === '분류대기') return -1;
    if (b.name === '분류대기') return 1;
    return (
      (counts[b.name]?.total ?? 0) - (counts[a.name]?.total ?? 0) ||
      a.name.localeCompare(b.name, 'ko')
    );
  });

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

      <div className="mt-6 max-w-5xl">
        <AdminReclassifyPanel />
      </div>
      <div className="mt-4 max-w-5xl">
        <AdminCategorySuggestions
          existingNames={categories.map((item) => item.name)}
          onCategoryCreated={() => void loadCategories()}
        />
      </div>

      {loading ? (
        <Skeleton className="mt-6 h-32 w-full max-w-3xl" />
      ) : (
        <div className="mt-6 flex max-w-3xl flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">새 카테고리 추가</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <div className="sticky top-0 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-card p-4 shadow-[var(--hz-shadow)]">
            <h3 className="mr-auto text-base font-bold">등록된 카테고리 ({categories.length})</h3>
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
