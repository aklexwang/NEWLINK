import { useCallback, useEffect, useState } from 'react';
import { createCategory } from '../../api/admin';
import {
  getCategorySuggestions,
  moveSuggestion,
  type CategorySuggestion,
} from '../../api/notifications';
import { Button } from '@/components/admin/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card';

/**
 * 새 카테고리 후보: AI 가 "목록에 맞는 게 없다"며 제안한 이름별 채널 수.
 * 카테고리를 만들면 그 채널들을 바로 새 카테고리로 옮긴다.
 */
export function AdminCategorySuggestions({
  existingNames,
  onCategoryCreated,
}: {
  existingNames: string[];
  onCategoryCreated: () => void;
}) {
  const [rows, setRows] = useState<CategorySuggestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await getCategorySuggestions());
    } catch {
      setMessage('후보를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exists = (name: string) =>
    existingNames.some((item) => item.replace(/\s/g, '') === name.replace(/\s/g, ''));

  const handleCreate = async (name: string) => {
    setBusy(name);
    try {
      await createCategory({ name, emoji: '📁' });
      const { moved } = await moveSuggestion(name);
      setMessage(`"${name}" 카테고리를 만들고 채널 ${moved}개를 옮겼어요.`);
      onCategoryCreated();
      await load();
    } catch {
      setMessage('카테고리를 만들지 못했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const handleMove = async (name: string) => {
    setBusy(name);
    try {
      const { moved } = await moveSuggestion(name);
      setMessage(`"${name}" 카테고리로 채널 ${moved}개를 옮겼어요.`);
      onCategoryCreated();
      await load();
    } catch {
      setMessage('옮기지 못했습니다.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">새 카테고리 후보</CardTitle>
        <p className="text-sm text-muted-foreground">
          맞는 카테고리가 없어 AI 가 새 이름을 제안한 채널들이에요. 같은 이름이 5개 이상 모이면 종 알림이 와요.
          만들면 그 채널들이 바로 새 카테고리로 옮겨져요. 몇 개 안 되는 후보는 만들지 않아도 돼요.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {message && <p className="text-sm text-foreground">{message}</p>}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 후보가 없어요.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.name} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">
                    {row.name} <span className="text-sm text-primary">{row.count}개</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.samples.map((s) => `${s.title} (지금 ${s.category})`).join(' · ')}
                  </p>
                </div>
                {exists(row.name) ? (
                  <Button size="sm" disabled={busy !== null} onClick={() => void handleMove(row.name)}>
                    {busy === row.name ? '옮기는 중...' : `${row.count}개 옮기기`}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void handleCreate(row.name)}>
                    {busy === row.name ? '만드는 중...' : `카테고리 만들고 ${row.count}개 옮기기`}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
