// 등급 표시 규칙. 서버가 주는 grade 값(S~D)은 그대로 두고 화면 표시만 바꾼다.
// Node 테스트로도 돌릴 수 있게 다른 파일을 가져오지 않는다.

export type GradeCode = 'S' | 'A' | 'B' | 'C' | 'D';

export const GRADE_LABEL: Record<GradeCode, string> = {
  S: '최상',
  A: '우수',
  B: '양호',
  C: '보통',
  D: '낮음',
};

/** 점수 → 등급 구간 (서버 GRADE_*_MIN 과 같은 값). 위에서부터 첫 일치 */
export const GRADE_BANDS: { grade: GradeCode; label: string; min: number; range: string }[] = [
  { grade: 'S', label: '최상', min: 80, range: '80점 이상' },
  { grade: 'A', label: '우수', min: 65, range: '65~79점' },
  { grade: 'B', label: '양호', min: 50, range: '50~64점' },
  { grade: 'C', label: '보통', min: 35, range: '35~49점' },
  { grade: 'D', label: '낮음', min: 0, range: '35점 미만' },
];

/** 점수 기준 가중치. 채널과 그룹이 다르다 */
export const SCORE_WEIGHTS = {
  channel: [
    { label: '규모', percent: 30 },
    { label: '실조회율', percent: 30 },
    { label: '활동량', percent: 25 },
    { label: '성장률', percent: 15 },
  ],
  group: [
    { label: '규모', percent: 45 },
    { label: '활동량', percent: 40 },
    { label: '성장률', percent: 15 },
  ],
} as const;

/** 수집 기간이 이만큼 안 되면 임시 등급 (서버 DATA_SHORT_DAYS) */
export const PROVISIONAL_DAYS = 7;

/** 서버 값을 등급 코드로. 모르는 값이면 null */
export function normalizeGrade(value: string | null | undefined): GradeCode | null {
  const upper = (value ?? '').trim().toUpperCase();
  return upper === 'S' || upper === 'A' || upper === 'B' || upper === 'C' || upper === 'D'
    ? upper
    : null;
}

/** S→최상, A→우수, B→양호, C→보통, D→낮음. 모르는 값이면 null */
export function gradeLabel(value: string | null | undefined): string | null {
  const grade = normalizeGrade(value);
  return grade ? GRADE_LABEL[grade] : null;
}

/** 수집 기간이 7일 미만이면 true. 기간을 모르면 false */
export function isProvisionalGrade(observedDays: number | null | undefined): boolean {
  return observedDays != null && Number.isFinite(observedDays) && observedDays < PROVISIONAL_DAYS;
}

/** "수집 3일째 · 임시 등급". 7일 이상이거나 모르면 null */
export function provisionalNote(observedDays: number | null | undefined): string | null {
  if (!isProvisionalGrade(observedDays)) return null;
  const days = Math.max(1, Math.floor(observedDays as number));
  return `수집 ${days}일째 · 임시 등급`;
}

/** 점수(100점 만점) 표시. 없으면 null */
export function formatScore(score: number | null | undefined): string | null {
  if (score == null || !Number.isFinite(score)) return null;
  return `${Math.round(score)}점`;
}

/** 점수로 등급 구간 찾기 */
export function gradeFromScore(score: number | null | undefined): GradeCode | null {
  if (score == null || !Number.isFinite(score)) return null;
  const band = GRADE_BANDS.find((item) => score >= item.min);
  return band ? band.grade : 'D';
}

/** "규모 30% · 실조회율 30% · 활동량 25% · 성장률 15%" */
export function weightsText(kind: 'channel' | 'group'): string {
  return SCORE_WEIGHTS[kind].map((item) => `${item.label} ${item.percent}%`).join(' · ');
}
