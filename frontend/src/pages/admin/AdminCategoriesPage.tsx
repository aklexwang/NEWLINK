import { useCallback, useEffect, useState } from 'react';
import {
  createCategory,
  deleteCategory,
  getAdminCategories,
  updateCategory,
} from '../../api/admin';
import { CategoryIcon } from '../../components/CategoryIcon';
import { CategoryIconPicker } from '../../components/CategoryIconPicker';
import type { CategoryItem } from '../../types/categoryItem';

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [newCategory, setNewCategory] = useState({ name: '', emoji: '📁', iconUrl: null as string | null });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ emoji: '📁', iconUrl: null as string | null });

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
    loadCategories();
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

  const startEditIcon = (item: CategoryItem) => {
    setEditingId(item.id);
    setEditDraft({ emoji: item.emoji, iconUrl: item.iconUrl ?? null });
  };

  const handleSaveIcon = async (id: string) => {
    try {
      await updateCategory(id, { emoji: editDraft.emoji, iconUrl: editDraft.iconUrl });
      setEditingId(null);
      setMessage('카테고리 아이콘이 수정되었습니다.');
      await loadCategories();
    } catch {
      setMessage('아이콘 수정에 실패했습니다.');
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

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <h2 className="text-xl font-bold text-slate-900">카테고리</h2>
        <p className="mt-1 text-sm text-slate-500">카테고리와 아이콘을 관리합니다.</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && (
          <div className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-800 shadow-sm ring-1 ring-black/5">
            {message}
          </div>
        )}

        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : (
          <div className="flex max-w-3xl flex-col gap-4">
            <form onSubmit={handleCreateCategory} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <h3 className="mb-3 text-sm font-semibold text-slate-900">새 카테고리 추가</h3>
              <div className="flex flex-col gap-3">
                <input
                  required
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  placeholder="카테고리 이름 (예: 게임)"
                  className="rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-black/5"
                />
                <CategoryIconPicker
                  emoji={newCategory.emoji}
                  iconUrl={newCategory.iconUrl}
                  onEmojiChange={(emoji) => setNewCategory({ ...newCategory, emoji })}
                  onIconUrlChange={(iconUrl) => setNewCategory({ ...newCategory, iconUrl })}
                />
                <button type="submit" className="rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700">
                  카테고리 추가
                </button>
              </div>
            </form>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-slate-900">등록된 카테고리 ({categories.length})</h3>
              {categories.length === 0 ? (
                <p className="text-sm text-slate-500">등록된 카테고리가 없습니다.</p>
              ) : (
                categories.map((item) => (
                  <div key={item.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                    <div className="flex items-center gap-3">
                      <CategoryIcon emoji={item.emoji} iconUrl={item.iconUrl} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500">순서 {item.sortOrder} · {item.isActive ? '활성' : '비활성'}</p>
                      </div>
                      <button type="button" onClick={() => startEditIcon(item)} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs ring-1 ring-black/5">아이콘</button>
                      <button type="button" onClick={() => handleToggleActive(item)} className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs ring-1 ring-black/5">
                        {item.isActive ? '끄기' : '켜기'}
                      </button>
                      <button type="button" onClick={() => handleDeleteCategory(item.id)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">삭제</button>
                    </div>

                    {editingId === item.id && (
                      <div className="mt-3 border-t border-black/5 pt-3">
                        <CategoryIconPicker
                          emoji={editDraft.emoji}
                          iconUrl={editDraft.iconUrl}
                          onEmojiChange={(emoji) => setEditDraft({ ...editDraft, emoji })}
                          onIconUrlChange={(iconUrl) => setEditDraft({ ...editDraft, iconUrl })}
                        />
                        <div className="mt-3 flex gap-2">
                          <button type="button" onClick={() => handleSaveIcon(item.id)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white">저장</button>
                          <button type="button" onClick={() => setEditingId(null)} className="rounded-xl bg-white px-4 py-2 text-sm ring-1 ring-black/5">취소</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}