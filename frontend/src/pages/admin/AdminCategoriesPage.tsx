import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import {
  createCategory,
  deleteCategory,
  getAdminCategories,
  updateCategory,
} from '../../api/admin';
import { CategoryIcon } from '../../components/CategoryIcon';
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

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getAdminCategories();
      setCategories(items);
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

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('이 카테고리를 삭제할까요?')) return;
    await deleteCategory(id);
    setMessage('카테고리가 삭제되었습니다.');
    await loadCategories();
  };

  const handleMove = async (index: number, dir: -1 | 1) => {
    const next = index + dir;
    if (next < 0 || next >= categories.length) return;
    const current = categories[index];
    const neighbor = categories[next];
    setSaving(true);
    try {
      await updateCategory(current.id, { sortOrder: neighbor.sortOrder });
      await updateCategory(neighbor.id, { sortOrder: current.sortOrder });
      await loadCategories();
    } catch {
      setMessage('순서를 바꾸지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <p className="mt-1 text-sm text-muted-foreground">
        이름·아이콘·순서를 관리합니다. 회원 화면 카테고리 목록도 이 순서를 따릅니다.
      </p>
      {message && <p className="mt-3 text-sm text-foreground">{message}</p>}

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

          <h3 className="mt-4 text-sm font-semibold">등록된 카테고리 ({categories.length})</h3>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">등록된 카테고리가 없습니다.</p>
          ) : (
            categories.map((item, index) => (
              <Card key={item.id}>
                <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                  <CategoryIcon emoji={item.emoji} iconUrl={item.iconUrl} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      순서 {item.sortOrder} · {item.isActive ? '활성' : '비활성'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || index === 0}
                      onClick={() => void handleMove(index, -1)}
                    >
                      위
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || index === categories.length - 1}
                      onClick={() => void handleMove(index, 1)}
                    >
                      아래
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
