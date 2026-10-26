// 새 버전 안내 규칙. Node 테스트로도 돌릴 수 있게 다른 파일을 가져오지 않는다.

/** 이만큼마다 /version.json 을 확인한다 */
export const VERSION_CHECK_MS = 5 * 60 * 1000;

/** 서버의 빌드 번호가 내 것과 다르면 새 버전 */
export function isNewerBuild(current: string, remote: unknown): boolean {
  if (!current || current === 'dev') return false;
  if (!remote || typeof remote !== 'object') return false;
  const build = (remote as { build?: unknown }).build;
  return typeof build === 'string' && build.length > 0 && build !== current;
}
