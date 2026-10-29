import { useMemo, useRef, useState, type DragEvent } from 'react';
import '@/styles/admin.css';
import { AdminThemeProvider } from '../../components/admin/AdminThemeProvider';
import { isAdminAuthenticated } from '../../utils/adminAccess';
import {
  COLLECTOR_CHANNEL,
  COLLECTOR_HANDOFF_KEY,
  collectTelegramEntries,
  dedupeRows,
  findLinesWithKeywords,
  findTelegramInText,
  findValuesByKey,
  parseKeys,
  rowsToCsv,
  type CollectorHandoff,
  type FoundRow,
} from '../../utils/keywordFinder';

const SHOW_MAX = 3000;
/** 대량 등록은 한 번에 500줄까지 */
const BULK_MAX = 500;
const ACCEPT = '.txt,.json,.log,.csv,.xml,.yml,.yaml,.ini,.md';

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob(['﻿', content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 수집기: 새 창으로 열리는 키워드 찾기 도구 (윈도우 KeywordFinder 와 같은 동작).
 * 넣은 데이터는 이 창 안에서만 처리하고 서버로 보내지 않는다.
 */
const BULK_PATH = '/admin/register-link';

/** 어드민 창을 링크 등록 › 대량 화면으로 열고(없으면 새로 열고) 목록을 넘긴다 */
function openBulkScreen(payload: CollectorHandoff) {
  const opener = window.opener as Window | null;
  try {
    if (opener && !opener.closed) {
      if (opener.location.pathname === BULK_PATH) {
        // 이미 링크 등록 화면: 대량 탭으로 바꾸고 목록 전달
        opener.postMessage({ type: COLLECTOR_CHANNEL, ...payload }, window.location.origin);
      } else {
        // 다른 화면이면 대량 화면으로 이동 (목록은 저장해 둔 것으로 받음)
        opener.location.href = `${BULK_PATH}?tab=bulk`;
      }
      opener.focus();
      return;
    }
  } catch {
    // 다른 주소의 창이면 아래에서 새로 연다
  }
  const w = window.open(`${BULK_PATH}?tab=bulk`, 'nl-admin');
  w?.focus();
}

export function AdminCollectorToolPage() {
  return (
    <AdminThemeProvider>
      {isAdminAuthenticated() ? (
        <CollectorTool />
      ) : (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
          <div>
            <p className="text-lg font-bold text-foreground">어드민에 먼저 로그인해 주세요</p>
            <p className="mt-2 text-sm text-muted-foreground">로그인한 어드민 창에서 [수집기]를 눌러 여세요.</p>
          </div>
        </div>
      )}
    </AdminThemeProvider>
  );
}

function CollectorTool() {
  const [data, setData] = useState('');
  const [fileName, setFileName] = useState('');
  const [keys, setKeys] = useState('username');
  const [mode, setMode] = useState<'key' | 'line' | 'tg'>('key');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [unique, setUnique] = useState(true);
  /** _c3285789158 처럼 _ 로 시작하는 값(아이디 없는 방 번호)은 결과에서 뺀다 */
  const [dropUnderscore, setDropUnderscore] = useState(true);
  const [rows, setRows] = useState<FoundRow[] | null>(null);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  /** 500개씩 나눠 보낼 때 다음 시작 위치 */
  const [sentOffset, setSentOffset] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    if (!data) return '0줄, 0자';
    const lines = data.split('\n').length;
    return `${lines.toLocaleString('ko-KR')}줄, ${data.length.toLocaleString('ko-KR')}자`;
  }, [data]);

  // "_ 빼기": 값 앞의 _ 만 지운다 (_c1476299484 → c1476299484). 값 자체는 남긴다
  const filtered = useMemo(
    () => (rows && dropUnderscore ? rows.map((r) => ({ ...r, value: r.value.trim().replace(/^_+/, '') })) : rows),
    [rows, dropUnderscore],
  );
  const underscoreCount = useMemo(
    () => (rows ?? []).filter((r) => r.value.trim().startsWith('_')).length,
    [rows],
  );
  const shown = useMemo(
    () => (filtered && unique ? dedupeRows(filtered, caseSensitive) : filtered),
    [filtered, unique, caseSensitive],
  );
  const entries = useMemo(() => (shown && mode !== 'line' ? collectTelegramEntries(shown) : []), [shown, mode]);

  const loadFiles = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    const texts = await Promise.all(list.map((f) => f.text()));
    setData(texts.join('\n'));
    setFileName(list.map((f) => f.name).join(', '));
    setRows(null);
    setNotice('');
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void loadFiles(event.dataTransfer.files);
  };

  const run = () => {
    const keyList = parseKeys(keys);
    if (!data.trim()) {
      setNotice('데이터를 먼저 넣어 주세요.');
      return;
    }
    if (mode !== 'tg' && keyList.length === 0) {
      setNotice('찾을 키 이름을 넣어 주세요.');
      return;
    }
    const found =
      mode === 'tg'
        ? findTelegramInText(data)
        : mode === 'key'
          ? findValuesByKey(data, keyList, caseSensitive)
          : findLinesWithKeywords(data, keyList, caseSensitive);
    setRows(found);
    setSentOffset(0);
    setNotice(found.length === 0 ? '찾은 값이 없어요.' : '');
  };

  const copyValues = async () => {
    if (!shown?.length) return;
    await navigator.clipboard.writeText(shown.map((r) => r.value).join('\n'));
    setNotice(`${shown.length.toLocaleString('ko-KR')}개 값을 복사했어요.`);
  };

  const sendToBulk = () => {
    if (entries.length === 0) return;
    const start = sentOffset >= entries.length ? 0 : sentOffset;
    const batch = entries.slice(start, start + BULK_MAX);
    const payload: CollectorHandoff = { at: Date.now(), entries: batch };
    try {
      localStorage.setItem(COLLECTOR_HANDOFF_KEY, JSON.stringify(payload));
    } catch {
      // 저장이 막혀도 아래 통로로 보낸다
    }
    try {
      const ch = new BroadcastChannel(COLLECTOR_CHANNEL);
      ch.postMessage(payload);
      ch.close();
    } catch {
      // 오래된 브라우저
    }
    openBulkScreen(payload);
    const next = start + batch.length;
    setSentOffset(next);
    const left = entries.length - next;
    setNotice(
      `텔레그램 아이디 ${(start + 1).toLocaleString('ko-KR')}~${next.toLocaleString('ko-KR')}번(${batch.length.toLocaleString('ko-KR')}개)을 대량 등록으로 보냈어요. 어드민 창의 링크 등록 › 대량에서 [확인]을 누르세요.` +
        (left > 0 ? ` 남은 ${left.toLocaleString('ko-KR')}개는 확인·등록이 끝난 뒤 다시 [보내기]를 누르세요.` : ''),
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <header className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🧲
          </span>
          <div>
            <h1 className="text-xl font-bold">수집기 · 키 이름으로 값 찾기</h1>
            <p className="text-sm text-muted-foreground">
              데이터에서 원하는 키(예: username)의 값을 찾아 보여 줘요. 넣은 데이터는 이 창 안에서만 처리돼요.
            </p>
          </div>
        </header>

        <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <p className="text-sm font-semibold">데이터 (여기에 붙여 넣거나 파일을 끌어다 놓으세요)</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`relative mt-2 rounded-xl ${dragging ? 'ring-2 ring-primary' : ''}`}
          >
            <textarea
              value={data}
              onChange={(e) => {
                setData(e.target.value);
                setFileName('');
                setRows(null);
              }}
              rows={10}
              spellCheck={false}
              className="w-full rounded-xl bg-muted px-3 py-2 font-mono text-[13px] outline-none ring-1 ring-border focus:ring-primary/50"
              placeholder={'{ "username": "example" } 같은 텍스트를 붙여 넣거나\n.txt / .json / .csv 파일을 여기에 끌어다 놓으세요'}
            />
            {dragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-primary/10 text-base font-bold text-primary">
                여기에 놓으면 불러와요
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm text-muted-foreground">
              {stats}
              {fileName && <span className="ml-2 text-foreground">· {fileName}</span>}
            </p>
            <button
              type="button"
              onClick={() => {
                setData('');
                setFileName('');
                setRows(null);
                setNotice('');
              }}
              className="rounded-xl bg-muted px-4 py-2 text-sm font-medium ring-1 ring-border"
            >
              지우기
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-xl bg-muted px-4 py-2 text-sm font-medium ring-1 ring-border"
            >
              파일 불러오기…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              multiple
              hidden
              onChange={(e) => {
                void loadFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <label className="text-sm font-semibold" htmlFor="collector-keys">
            찾을 키 이름 <span className="font-normal text-muted-foreground">(여러 개는 쉼표로)</span>
          </label>
          <input
            id="collector-keys"
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run();
            }}
            className="mt-2 h-11 w-full rounded-xl bg-muted px-3 text-[15px] outline-none ring-1 ring-border focus:ring-primary/50"
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === 'key'} onChange={() => setMode('key')} />
              키 이름으로 값 찾기 <span className="text-muted-foreground">(username → holdemlove)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === 'line'} onChange={() => setMode('line')} />
              키워드가 들어간 줄 찾기
            </label>
            <label className="flex items-center gap-2" title="사이트 목록 화면을 통째로 복사해 붙여 넣었을 때. 키 이름은 안 넣어도 돼요">
              <input type="radio" checked={mode === 'tg'} onChange={() => setMode('tg')} />
              글에서 텔레그램 주소 뽑기 <span className="text-muted-foreground">(@아이디·t.me 링크)</span>
            </label>
            <label className="ml-auto flex items-center gap-2">
              <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
              대소문자 구분
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={unique} onChange={(e) => setUnique(e.target.checked)} />
              중복 빼기
            </label>
            <label className="flex items-center gap-2" title="_c3285789158 → c3285789158 처럼 값 앞의 _ 만 지웁니다">
              <input type="checkbox" checked={dropUnderscore} onChange={(e) => setDropUnderscore(e.target.checked)} />
              _ 빼기
            </label>
          </div>
          <button
            type="button"
            onClick={run}
            className="mt-4 h-12 w-full rounded-xl bg-primary text-base font-bold text-white"
          >
            찾기
          </button>
        </section>

        {notice && (
          <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-foreground ring-1 ring-primary/30">{notice}</p>
        )}

        {shown && shown.length > 0 && (
          <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-auto text-sm font-semibold">
                결과 {shown.length.toLocaleString('ko-KR')}개
                {filtered && unique && filtered.length !== shown.length && (
                  <span className="ml-1 font-normal text-muted-foreground">(중복 {(filtered.length - shown.length).toLocaleString('ko-KR')}개 뺌)</span>
                )}
                {dropUnderscore && underscoreCount > 0 && (
                  <span className="ml-1 font-normal text-muted-foreground">(앞의 _ 지움 {underscoreCount.toLocaleString('ko-KR')}개)</span>
                )}
              </p>
              <button type="button" onClick={() => void copyValues()} className="rounded-xl bg-muted px-3 py-2 text-sm ring-1 ring-border">
                값 복사
              </button>
              <button
                type="button"
                onClick={() => download(`검색결과_${stamp()}.txt`, shown.map((r) => r.value).join('\n'), 'text/plain')}
                className="rounded-xl bg-muted px-3 py-2 text-sm ring-1 ring-border"
              >
                결과 저장 (txt)
              </button>
              <button
                type="button"
                onClick={() => download(`검색결과_${stamp()}.csv`, rowsToCsv(shown), 'text/csv')}
                className="rounded-xl bg-muted px-3 py-2 text-sm ring-1 ring-border"
              >
                CSV 저장
              </button>
            </div>

            {mode !== 'line' && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/30">
                <p className="mr-auto text-sm">
                  이 중 텔레그램 아이디로 쓸 수 있는 값 <b>{entries.length.toLocaleString('ko-KR')}개</b>
                  <span className="ml-1 text-muted-foreground">{dropUnderscore ? '(숫자만인 값은 뺌)' : '(숫자만·_c123 같은 값은 뺌)'}</span>
                </p>
                <button
                  type="button"
                  disabled={entries.length === 0}
                  onClick={sendToBulk}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {entries.length > BULK_MAX
                    ? `대량 등록으로 보내기 (${Math.min(sentOffset >= entries.length ? 0 : sentOffset, entries.length) + 1}~${Math.min((sentOffset >= entries.length ? 0 : sentOffset) + BULK_MAX, entries.length)}번) →`
                    : '대량 등록으로 보내기 →'}
                </button>
              </div>
            )}

            <div className="mt-3 max-h-[50vh] overflow-auto rounded-xl ring-1 ring-border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">키</th>
                    <th className="px-3 py-2 font-medium">값</th>
                    <th className="px-3 py-2 font-medium">줄</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, SHOW_MAX).map((row, i) => (
                    <tr
                      key={`${row.line}-${i}`}
                      className="cursor-pointer border-t border-border hover:bg-muted/60"
                      title="더블클릭하면 값이 복사돼요"
                      onDoubleClick={() => {
                        void navigator.clipboard.writeText(row.value);
                        setNotice(`복사했어요: ${row.value.slice(0, 60)}`);
                      }}
                    >
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{row.key}</td>
                      <td className="max-w-[420px] truncate px-3 py-1.5 font-mono">{row.value}</td>
                      <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{row.line}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > SHOW_MAX && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  화면에는 {SHOW_MAX.toLocaleString('ko-KR')}개까지만 보여요. 저장·복사·보내기는 전부 포함돼요.
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">결과를 더블클릭하면 그 값이 복사돼요.</p>
          </section>
        )}
      </div>
    </div>
  );
}
