/**
 * 수집기(키워드 찾기): 붙여 넣은 텍스트에서 원하는 키의 값이나 키워드가 든 줄을 찾는다.
 * 모두 브라우저 안에서만 처리한다 (서버로 보내지 않음).
 */

export type FoundRow = { key: string; value: string; line: number };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 쉼표로 여러 키 */
export function parseKeys(raw: string): string[] {
  return [...new Set(raw.split(',').map((k) => k.trim()).filter(Boolean))];
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function lineOf(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function unescapeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

/**
 * 키 이름으로 값 찾기.
 * - JSON: "username": "abc" / "count": 12 / 'key': 'v'
 * - 설정 줄: username = abc, username: abc
 */
export function findValuesByKey(text: string, keys: string[], caseSensitive: boolean): FoundRow[] {
  if (!text || keys.length === 0) return [];
  const starts = lineStarts(text);
  const flags = caseSensitive ? 'g' : 'gi';
  const rows: Array<FoundRow & { index: number }> = [];
  for (const key of keys) {
    const k = escapeRegExp(key);
    // "key" : "value"  |  "key": 123/true/false/null
    const quoted = new RegExp(
      `["']${k}["']\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|(-?\\d+(?:\\.\\d+)?|true|false|null))`,
      flags,
    );
    const seen = new Set<number>();
    for (const m of text.matchAll(quoted)) {
      const index = m.index ?? 0;
      seen.add(index);
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      const value = m[1] != null ? unescapeJsonString(raw) : raw;
      rows.push({ key, value, line: lineOf(starts, index), index });
    }
    // key = value / key: value (따옴표 없는 줄)
    const plain = new RegExp(`(^|[\\s,;{])${k}\\s*[:=]\\s*([^\\s,;"'{}\\[\\]]+)`, `${flags}m`);
    for (const m of text.matchAll(plain)) {
      const index = (m.index ?? 0) + m[1].length;
      if (seen.has(index) || text[index - 1] === '"' || text[index - 1] === "'") continue;
      rows.push({ key, value: m[2], line: lineOf(starts, index), index });
    }
  }
  rows.sort((a, b) => a.index - b.index);
  return rows.map(({ key, value, line }) => ({ key, value, line }));
}

/** 키워드가 들어간 줄 찾기 (값 = 그 줄 전체) */
export function findLinesWithKeywords(text: string, keywords: string[], caseSensitive: boolean): FoundRow[] {
  if (!text || keywords.length === 0) return [];
  const rows: FoundRow[] = [];
  const lines = text.split(/\r?\n/);
  const needles = caseSensitive ? keywords : keywords.map((k) => k.toLowerCase());
  lines.forEach((line, i) => {
    const hay = caseSensitive ? line : line.toLowerCase();
    const hit = needles.findIndex((n) => hay.includes(n));
    if (hit >= 0) rows.push({ key: keywords[hit], value: line.trim(), line: i + 1 });
  });
  return rows;
}

/** 같은 값은 처음 것만 */
export function dedupeRows(rows: FoundRow[], caseSensitive: boolean): FoundRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const k = caseSensitive ? row.value : row.value.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

/**
 * 대량 등록에 넣을 수 있는 텔레그램 주소로 바꾸기. 아니면 null.
 * - 아이디(영문 시작 5~32자), @아이디, t.me/아이디, t.me/+초대코드
 * - 숫자만·_c123 같은 값은 null
 */
export function toTelegramEntry(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const invite = v.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(\+[A-Za-z0-9_-]{6,}|joinchat\/[A-Za-z0-9_-]{6,})/i);
  if (invite) return `https://t.me/${invite[1]}`;
  const link = v.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]+)/i);
  const name = (link ? link[1] : v).replace(/^@/, '');
  if (!USERNAME_RE.test(name)) return null;
  if (name.endsWith('_')) return null;
  return name;
}

/** 사이트 목록을 통째로 복사한 글에서 빼면 안 되는 흔한 단어(텔레그램 자체 주소 등) */
const TEXT_SKIP = new Set(['share', 'joinchat', 'addstickers', 'proxy', 'socks', 'iv', 'setlanguage', 'telegram', 'contact']);

/**
 * 아무 글(사이트 목록 화면을 통째로 복사한 것)에서 텔레그램 주소만 뽑기.
 * - t.me/아이디, telegram.me/아이디, t.me/+초대코드, @아이디
 * - 이메일(abc@naver.com) 은 빼고, 봇(…bot)은 그대로 둔다(등록 확인에서 걸러짐)
 */
export function findTelegramInText(text: string): FoundRow[] {
  const out: FoundRow[] = [];
  const lines = text.split('\n');
  const linkRe = /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\/(?:s\/)?(\+[A-Za-z0-9_-]{6,}|joinchat\/[A-Za-z0-9_-]{6,}|[A-Za-z][A-Za-z0-9_]{3,31})/gi;
  const atRe = /(^|[^A-Za-z0-9_.@])@([A-Za-z][A-Za-z0-9_]{3,31})(?![A-Za-z0-9_.]*\.[A-Za-z]{2,})/g;
  lines.forEach((line, index) => {
    for (const m of line.matchAll(linkRe)) {
      const raw = m[1];
      if (!raw.startsWith('+') && !raw.toLowerCase().startsWith('joinchat/') && TEXT_SKIP.has(raw.toLowerCase())) continue;
      const entry = toTelegramEntry(`t.me/${raw}`);
      if (entry) out.push({ key: 'telegram', value: entry, line: index + 1 });
    }
    for (const m of line.matchAll(atRe)) {
      const name = m[2];
      if (TEXT_SKIP.has(name.toLowerCase())) continue;
      const entry = toTelegramEntry(name);
      if (entry) out.push({ key: 'telegram', value: entry, line: index + 1 });
    }
  });
  return out;
}

export function collectTelegramEntries(rows: FoundRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const entry = toTelegramEntry(row.value);
    if (!entry) continue;
    const key = entry.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

export function rowsToCsv(rows: FoundRow[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return ['번호,키,값,줄', ...rows.map((r, i) => `${i + 1},${esc(r.key)},${esc(r.value)},${r.line}`)].join('\n');
}

/** 수집기 창 → 대량 등록 창으로 보내는 통로 */
export const COLLECTOR_CHANNEL = 'nl-collector';
export const COLLECTOR_HANDOFF_KEY = 'nl-collector-handoff';
export type CollectorHandoff = { at: number; entries: string[] };
