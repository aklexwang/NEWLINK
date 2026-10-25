import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import {
  getAdminCategories,
  getAdminLinkInspectJob,
  getLatestAdminLinkInspect,
  registerAdminInspectMany,
  resumeAdminLinkInspect,
  startAdminLinkInspect,
  type AdminInspectItemResult,
  type AdminInspectItemView,
  type AdminInspectJobView,
} from '../../api/admin';
import { AdminMessage } from '../../components/admin/AdminTable';
import type { CategoryItem } from '../../types/categoryItem';

const RESULT_LABEL: Record<AdminInspectItemResult, string> = {
  ok: '정상',
  already_registered: '이미 등록됨',
  not_korean: '외국어',
  language_unknown: '언어 미확인',
  too_small: '100명 미만',
  not_found: '없는 채널',
  invite_or_private: '초대 만료·비공개',
  invalid_format: '형식 오류',
};

const REGISTER_MAX = 100;

// 정상과 '언어 미확인'(경고만)은 등록할 수 있다. 미확인은 기본 선택에서 빠진다.
function isRegistrable(item: AdminInspectItemView) {
  return (item.result === 'ok' || item.result === 'language_unknown') && !item.registeredChannelId;
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (Array.isArray(msg)) return msg.filter(Boolean).join('\n');
  }
  return fallback;
}

function resultLabel(item: AdminInspectItemView) {
  if (item.resultCaption) return item.resultCaption;
  if (item.result === 'already_registered') {
    if (item.memberPageVisible === true) return '이미 등록됨 · 노출 중';
    if (item.memberPageVisible === false) {
      const reason = item.memberPageReason?.trim();
      return reason ? `이미 등록됨 · 숨김(${reason})` : '이미 등록됨 · 숨김';
    }
    return '이미 등록됨';
  }
  if (item.registeredThisJob || (item.registeredChannelId && item.result === 'ok')) {
    return '이번에 등록함';
  }
  if (!item.result) return '확인 중';
  return RESULT_LABEL[item.result];
}

export function AdminLinkInspectBulk() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [job, setJob] = useState<AdminInspectJobView | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminCategories()
      .then((items) => {
        const active = items.filter((item) => item.isActive);
        setCategories(active);
      })
      .catch(() => setCategories([]));
    getLatestAdminLinkInspect()
      .then((latest) => {
        if (latest) {
          setJob(latest);
          if (latest.category) setCategory(latest.category);
          setSelected(defaultSelected(latest.items));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = window.setInterval(() => {
      getAdminLinkInspectJob(job.id)
        .then((next) => {
          setJob(next);
          setSelected((prev) => keepAllowedSelection(prev, next.items));
        })
        .catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  const selectable = useMemo(
    () =>
      (job?.items ?? []).filter(
        (item) => item.result === 'ok' && !item.registeredChannelId,
      ),
    [job],
  );

  const startInspect = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { jobId } = await startAdminLinkInspect({
        text,
        category: category || undefined,
      });
      const next = await getAdminLinkInspectJob(jobId);
      setJob(next);
      setSelected(defaultSelected(next.items));
    } catch (err) {
      setError(apiErrorMessage(err, '확인을 시작하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const resumeInspect = async () => {
    if (!job) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await resumeAdminLinkInspect(job.id);
      const next = await getAdminLinkInspectJob(job.id);
      setJob(next);
    } catch (err) {
      setError(apiErrorMessage(err, '이어서 확인하지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (next.size >= REGISTER_MAX && !next.has(id)) return prev;
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const selectNormals = () => {
    setSelected(new Set(selectable.slice(0, REGISTER_MAX).map((item) => item.id)));
  };

  const registerSelected = async () => {
    if (selected.size === 0) {
      setError('등록할 항목을 선택해 주세요.');
      return;
    }
    if (selected.size > REGISTER_MAX) {
      setError(`한 번에 최대 ${REGISTER_MAX}개만 등록할 수 있습니다.`);
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { results } = await registerAdminInspectMany({
        ids: [...selected],
        category: category || undefined,
      });
      const okCount = results.filter((row) => row.ok).length;
      const failCount = results.length - okCount;
      setMessage(
        failCount > 0
          ? `${okCount}개 등록, ${failCount}개는 건너뛰었습니다.`
          : `${okCount}개를 등록했습니다.`,
      );
      if (job) {
        const next = await getAdminLinkInspectJob(job.id);
        setJob(next);
        setSelected(defaultSelected(next.items));
      }
    } catch (err) {
      setError(apiErrorMessage(err, '등록에 실패했습니다.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {message && <AdminMessage message={message} />}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
          {error}
        </div>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <label className="block text-sm font-medium text-slate-700">링크 붙여넣기</label>
        <p className="mt-1 text-xs text-slate-500">
          t.me 링크, @아이디, 아이디만. 한 줄에 하나, 최대 500줄. 중복은 빼 둡니다.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          className="mt-3 w-full rounded-xl bg-slate-50 px-4 py-3 font-mono text-sm outline-none ring-1 ring-black/5 focus:ring-blue-300"
          placeholder={'https://t.me/example\n@username\nchannelid'}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl bg-slate-50 px-3 py-2 text-sm outline-none ring-1 ring-black/5"
          >
            <option value="">분류 자동</option>
            {categories.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void startInspect()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && job?.status === 'running' ? '확인 중...' : '확인'}
          </button>
          {job?.status === 'interrupted' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void resumeInspect()}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              이어서 확인
            </button>
          )}
        </div>
      </section>

      {job && (
        <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {job.processed}/{job.total} 확인
              {job.status === 'running' ? ' · 진행 중' : ''}
              {job.status === 'interrupted' ? ' · 중단됨' : ''}
              {job.status === 'completed' ? ' · 완료' : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectNormals}
                className="rounded-xl bg-white px-3 py-2 text-sm text-slate-700 ring-1 ring-black/10 hover:bg-slate-50"
              >
                정상만 선택
              </button>
              <button
                type="button"
                disabled={busy || selected.size === 0}
                onClick={() => void registerSelected()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                선택 등록 ({selected.size}/{REGISTER_MAX})
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-2 py-2 font-medium">선택</th>
                  <th className="px-2 py-2 font-medium">결과</th>
                  <th className="px-2 py-2 font-medium">제목</th>
                  <th className="px-2 py-2 font-medium">인원</th>
                  <th className="px-2 py-2 font-medium">종류</th>
                  <th className="px-2 py-2 font-medium">링크</th>
                </tr>
              </thead>
              <tbody>
                {job.items.map((item) => {
                  const canSelect = isRegistrable(item);
                  return (
                    <tr key={item.id} className="border-b border-slate-50">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          disabled={!canSelect}
                          checked={selected.has(item.id)}
                          onChange={(e) => toggle(item.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-2 py-2">{resultLabel(item)}</td>
                      <td className="px-2 py-2">{item.title ?? item.username ?? item.rawInput}</td>
                      <td className="px-2 py-2">{item.memberCount ?? '-'}</td>
                      <td className="px-2 py-2">
                        {item.linkType === 'group' ? '그룹' : item.linkType === 'channel' ? '채널' : '-'}
                      </td>
                      <td className="px-2 py-2 font-mono text-xs text-slate-500">
                        {item.link ?? item.rawInput}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function defaultSelected(items: AdminInspectItemView[]) {
  return new Set(
    items
      .filter((item) => item.result === 'ok' && !item.registeredChannelId)
      .slice(0, REGISTER_MAX)
      .map((item) => item.id),
  );
}

function keepAllowedSelection(prev: Set<string>, items: AdminInspectItemView[]) {
  const allowed = new Set(
    items
      .filter(isRegistrable)
      .map((item) => item.id),
  );
  const next = new Set<string>();
  for (const id of prev) {
    if (allowed.has(id)) next.add(id);
  }
  return next;
}
