import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createSearchTerm,
  deleteSearchTerm,
  getSearchTerms,
  updateSearchTerm,
  type SearchTermKind,
  type SearchTermRow,
} from '../../api/admin';
import { useToast } from '../../providers/ToastProvider';
import { adminApiErrorMessage } from '../../utils/adminApiError';

const KIND_LABEL: Record<SearchTermKind, string> = {
  block: '금지어',
  allow: '예외어',
};

function TermList({
  title,
  hint,
  rows,
  busyId,
  onToggle,
  onDelete,
}: {
  title: string;
  hint: string;
  rows: SearchTermRow[];
  busyId: string | null;
  onToggle: (row: SearchTermRow) => void;
  onDelete: (row: SearchTermRow) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[20px] bg-card shadow-[var(--hz-shadow)]">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-bold text-foreground">
          {title} <span className="font-normal text-muted-foreground">({rows.length})</span>
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">등록된 단어가 없습니다.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${row.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                  {row.term}
                </p>
                {row.termNormalized !== row.term && (
                  <p className="text-[11px] text-muted-foreground">비교용: {row.termNormalized}</p>
                )}
                {row.warning && <p className="mt-0.5 text-[11px] text-amber-700">{row.warning}</p>}
              </div>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => onToggle(row)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 disabled:opacity-50 ${
                  row.enabled
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-100 hover:bg-emerald-100'
                    : 'bg-muted text-subtle ring-border hover:bg-muted'
                }`}
              >
                {row.enabled ? '켜짐' : '꺼짐'}
              </button>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => onDelete(row)}
                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-100 hover:bg-red-100 disabled:opacity-50"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AdminSearchTermsPage() {
  const { confirm } = useToast();
  const [rows, setRows] = useState<SearchTermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<SearchTermKind>('block');
  const [term, setTerm] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await getSearchTerms());
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '금지어 목록을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!term.trim()) return;
    setAdding(true);
    try {
      const created = await createSearchTerm({ kind, term: term.trim() });
      setMessage(
        created.warning
          ? `${KIND_LABEL[kind]}를 추가했습니다. ${created.warning}`
          : `${KIND_LABEL[kind]}를 추가했습니다.`,
      );
      setTerm('');
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '추가하지 못했습니다.'));
    } finally {
      setAdding(false);
    }
  };

  const handleToggle = async (row: SearchTermRow) => {
    setBusyId(row.id);
    try {
      await updateSearchTerm(row.id, { enabled: !row.enabled });
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '바꾸지 못했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: SearchTermRow) => {
    const ok = await confirm(`"${row.term}" ${KIND_LABEL[row.kind]}를 삭제할까요?`);
    if (!ok) return;
    setBusyId(row.id);
    try {
      await deleteSearchTerm(row.id);
      setMessage(`"${row.term}" 을(를) 삭제했습니다.`);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '삭제하지 못했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  const blocks = rows.filter((row) => row.kind === 'block');
  const allows = rows.filter((row) => row.kind === 'allow');

  return (
    <>
      <header className="px-4 pt-1 pb-4 md:px-7">
        <p className="mt-1 text-sm text-muted-foreground">
          금지어가 들어 있는 검색은 결과 없이 &quot;해당 검색어는 허용하지 않습니다.&quot; 안내만 보여줍니다.
          공백·기호·대소문자·전각/반각은 무시하고 비교합니다. (예: 금지어 &quot;마약&quot; → &quot;마.약&quot;, &quot;마 약&quot;도 차단)
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {message && (
          <div className="rounded-xl bg-card px-4 py-3 text-sm text-foreground shadow-[var(--hz-shadow)]">
            {message}
          </div>
        )}

        <form
          onSubmit={(event) => void handleAdd(event)}
          className="flex flex-wrap items-end gap-2 rounded-[20px] bg-card p-4 shadow-[var(--hz-shadow)]"
        >
          <label className="text-xs text-muted-foreground">
            종류
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as SearchTermKind)}
              className="mt-1 block rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border"
            >
              <option value="block">금지어</option>
              <option value="allow">예외어 (금지어를 포함하지만 허용)</option>
            </select>
          </label>
          <label className="min-w-[200px] flex-1 text-xs text-muted-foreground">
            단어 (공백·기호를 뺀 한글·영문·숫자 2자 이상)
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              maxLength={64}
              placeholder={kind === 'block' ? '예: 마약' : '예: 마약김밥'}
              className="mt-1 block w-full rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-border"
            />
          </label>
          <button
            type="submit"
            disabled={adding || !term.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {adding ? '추가 중...' : '추가'}
          </button>
        </form>

        {loading ? (
          <div className="h-32 animate-pulse rounded-[20px] bg-card shadow-[var(--hz-shadow)]" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <TermList
              title="금지어"
              hint="검색어에 들어 있으면 차단합니다."
              rows={blocks}
              busyId={busyId}
              onToggle={(row) => void handleToggle(row)}
              onDelete={(row) => void handleDelete(row)}
            />
            <TermList
              title="예외어"
              hint="금지어를 포함해도 이 단어로 완전히 덮이면 허용합니다. (예: 마약김밥)"
              rows={allows}
              busyId={busyId}
              onToggle={(row) => void handleToggle(row)}
              onDelete={(row) => void handleDelete(row)}
            />
          </div>
        )}
      </div>
    </>
  );
}
