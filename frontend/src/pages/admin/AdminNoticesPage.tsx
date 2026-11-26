import { useCallback, useEffect, useState } from 'react';
import {
  createAdminNotice,
  deleteAdminNotice,
  getAdminNotices,
  updateAdminNotice,
  type AdminNotice,
} from '../../api/notices';
import { adminApiErrorMessage } from '../../utils/adminApiError';

const inputClass =
  'mt-1.5 w-full rounded-xl bg-background px-3.5 py-2.5 text-[15px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50';

function NoticeEditor({
  notice,
  onDone,
  onCancel,
}: {
  notice?: AdminNotice;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(notice?.title ?? '');
  const [body, setBody] = useState(notice?.body ?? '');
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  const [published, setPublished] = useState(notice?.published ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!title.trim()) {
      setError('제목을 입력해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (notice) await updateAdminNotice(notice.id, { title, body, pinned, published });
      else await createAdminNotice({ title, body, pinned, published });
      onDone();
    } catch (e) {
      setError(adminApiErrorMessage(e, '저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)] ring-2 ring-primary/30">
      <label className="block text-sm font-medium text-subtle">
        제목
        <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </label>
      <label className="mt-3 block text-sm font-medium text-subtle">
        내용
        <textarea
          value={body}
          maxLength={4000}
          rows={8}
          onChange={(e) => setBody(e.target.value)}
          className={inputClass}
        />
      </label>
      <div className="mt-3 flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-4 w-4" />
          맨 위 고정
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
            className="h-4 w-4"
          />
          회원에게 보이기
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-10 rounded-xl bg-muted px-4 text-sm font-semibold">
          취소
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="h-10 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );
}

/** 어드민 > 공지: 회원 화면 [공지] 에 나오는 글 */
export function AdminNoticesPage() {
  const [items, setItems] = useState<AdminNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(await getAdminNotices());
    } catch (e) {
      setMessage(adminApiErrorMessage(e, '공지를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (n: AdminNotice) => {
    if (!window.confirm(`"${n.title}" 공지를 지울까요? 되돌릴 수 없어요.`)) return;
    try {
      await deleteAdminNotice(n.id);
      void load();
    } catch (e) {
      setMessage(adminApiErrorMessage(e, '지우지 못했습니다.'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-subtle">
            회원 화면 위쪽 [공지] 버튼을 누르면 위에서 내려오는 창에 나와요. 로그인한 회원만 볼 수 있고, 새 공지가 있으면
            버튼에 빨간 점이 떠요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setEditingId(null);
          }}
          className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
        >
          + 공지 쓰기
        </button>
      </div>
      {message && <p className="text-sm text-destructive">{message}</p>}
      {adding && (
        <NoticeEditor
          onDone={() => {
            setAdding(false);
            void load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--hz-shadow)]">
          아직 공지가 없어요. [+ 공지 쓰기]로 넣어 주세요.
        </p>
      ) : (
        items.map((n) =>
          editingId === n.id ? (
            <NoticeEditor
              key={n.id}
              notice={n}
              onDone={() => {
                setEditingId(null);
                void load();
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={n.id} className="rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
              <div className="flex flex-wrap items-center gap-2">
                {n.pinned && (
                  <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">고정</span>
                )}
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                    n.published ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-subtle'
                  }`}
                >
                  {n.published ? '보이는 중' : '숨김'}
                </span>
                <p className="min-w-0 flex-1 text-base font-bold text-foreground">{n.title}</p>
                <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString('ko-KR')}</span>
              </div>
              {n.body && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-foreground/80">{n.body}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(n.id);
                    setAdding(false);
                  }}
                  className="h-9 rounded-lg bg-muted px-3 text-sm font-semibold"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => void updateAdminNotice(n.id, { published: !n.published }).then(load)}
                  className="h-9 rounded-lg bg-muted px-3 text-sm font-semibold"
                >
                  {n.published ? '숨기기' : '보이기'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(n)}
                  className="h-9 rounded-lg bg-muted px-3 text-sm font-semibold text-destructive"
                >
                  삭제
                </button>
              </div>
            </div>
          ),
        )
      )}
    </div>
  );
}
