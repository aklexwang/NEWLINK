import { useCallback, useEffect, useState } from 'react';
import { createCategory } from '../../api/admin';
import {
  getCategorySuggestions,
  reclassifySuggestion,
  type CategorySuggestion,
} from '../../api/notifications';
import { Button } from '@/components/admin/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card';

/**
 * 새 카테고리 후보: AI 가 "목록에 맞는 게 없다"며 제안한 이름별 채널 수.
 * 카테고리를 만든 뒤 [다시 분류]를 누르면 그 채널들이 새 카테고리로 갈 수 있다.
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
      setMessage(`"${name}" 카테고리를 만들었어요. 이제 [다시 분류]를 누르면 그 채널들이 옮겨질 수 있어요.`);
      onCategoryCreated();
    } catch {
      setMessage('카테고리를 만들지 못했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const handleReclassify = async (name: string) => {
    setBusy(name);
    try {
      const result = await reclassifySuggestion(name);
      setMessage(`"${name}" 후보 ${result.total}개를 다시 분류해 ${result.changed}개가 바뀌었어요.`);
      await load();
    } catch {
      setMessage('다시 분류하지 못했습니다.');
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
                  <Button size="sm" disabled={busy !== null} onClick={() => void handleReclassify(row.name)}>
                    {busy === row.name ? '분류 중...' : '다시 분류'}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void handleCreate(row.name)}>
                    카테고리 만들기
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
