/**
 * 보안 모니터링 순수 로직: IP 가리기 + 스캔/공격 의심 요청 분류.
 * 어드민 [보안 설정]에서 "우릴 스캔·노리는 시도"를 보여줄 때 쓴다.
 */

/** IP 일부 가림(사생활). IPv4 는 마지막 옥텟, IPv6 는 뒤쪽을 가린다. */
export function maskIp(raw: string | null | undefined): string {
  const ip = (raw ?? '').trim();
  if (!ip) return '-';
  // IPv4 (끝에 포트가 붙어와도 처리)
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  // IPv6: 앞 두 그룹만 남기고 가림
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    return parts.length > 2 ? `${parts[0]}:${parts[1]}:…` : ip;
  }
  return ip;
}

/** 공격·스캔에서 흔히 긁는 경로/확장자 패턴 */
const SCAN_PATTERNS: RegExp[] = [
  /\.env\b/i,
  /\.git\b/i,
  /wp-(admin|login|content|includes)/i,
  /\/phpmyadmin/i,
  /\/xmlrpc\.php/i,
  /\.(php|asp|aspx|jsp|cgi)\b/i,
  /\/\.(well-known|svn|hg)/i,
  /\/(actuator|console|shell|cmd)\b/i,
  /\/vendor\//i,
  /\/config(uration)?\.(php|json|yml|yaml)\b/i,
];

/** SQL 인젝션·경로 조작 등 요청값에 섞인 공격 흔적 */
const INJECTION_PATTERNS: RegExp[] = [
  /\bunion\b.*\bselect\b/i,
  /\bselect\b.*\bfrom\b/i,
  /\bor\b\s+1\s*=\s*1/i,
  /\.\.\/|\.\.\\/,
  /<script\b/i,
  /\bexec\b|\bxp_cmdshell\b/i,
];

export type SampleKind = 'scan' | 'injection' | 'scrape';

/**
 * 미니앱 밖에서 온(서명 없는) 요청 샘플을 분류한다.
 * - injection: 요청값에 공격 패턴
 * - scan: 취약점 긁는 알려진 경로
 * - scrape: 그 외(우리 API 를 그냥 긁으려는 시도)
 */
export function classifySample(path: string | null | undefined): SampleKind {
  const p = path ?? '';
  if (INJECTION_PATTERNS.some((re) => re.test(p))) return 'injection';
  if (SCAN_PATTERNS.some((re) => re.test(p))) return 'scan';
  return 'scrape';
}
