import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rootDir = dirname(fileURLToPath(import.meta.url));

/**
 * 배포마다 바뀌는 빌드 번호. Cloudflare Pages 는 커밋 SHA 를 준다.
 * 화면은 /version.json 을 주기적으로 읽어 자기 번호와 다르면 "새 버전" 안내를 띄운다.
 */
const BUILD_ID = (process.env.CF_PAGES_COMMIT_SHA ?? '').slice(0, 12) || Date.now().toString(36);

function versionFile(): Plugin {
  return {
    name: 'newlink-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: BUILD_ID }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  resolve: {
    alias: {
      '@': resolve(rootDir, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
});
