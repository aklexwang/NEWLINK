/**
 * 새로 배포하면 예전 화면 조각(파일 이름에 해시)이 사라진다.
 * 앱을 열어 둔 채 배포가 지나간 뒤 다른 화면으로 가면 "Failed to fetch dynamically imported module" 이 난다.
 * → 이런 오류는 새 버전을 받도록 한 번만 자동 새로고침한다 (30초 안에 또 나면 오류 화면을 보여 준다).
 */
const KEY = 'nl-chunk-reload-at';

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed|Unable to preload CSS/i.test(
    message,
  );
}

/** 새로고침했으면 true */
export function reloadOnceForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // 저장소를 못 쓰면 한 번만 시도
  }
  window.location.reload();
  return true;
}

/** lazy(() => import(...)) 대신 쓴다: 조각을 못 받으면 새 버전으로 새로고침 */
export function importWithReload<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((error: unknown) => {
      if (isChunkLoadError(error) && reloadOnceForNewVersion()) {
        // 새로고침되는 동안 화면은 그대로 둔다
        return new Promise<T>(() => undefined);
      }
      throw error;
    });
}

export function installChunkReloadListener() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForNewVersion()) event.preventDefault();
  });
}
