# NEWLINK

텔레그램 채널/그룹 디렉터리 미니앱 (한국어).

## 구조

- `backend/` — NestJS 11 + TypeORM. 로컬 SQLite, 운영 Render PostgreSQL. API prefix `/api`
- `frontend/` — React 19 + Vite + Tailwind 4. Cloudflare Pages
- `.github/workflows/stats-cron.yml` — 매일 수집 깨우기 (Render Free)

날짜·시각 기준은 한국시간(KST).

## 로컬 실행

```bash
# API (port 3000)
cd backend
copy .env.example .env
npm install
npm run start:dev

# 웹 (port 5173)
cd frontend
copy .env.example .env
npm install
npm run dev
```

macOS/Linux는 `copy` 대신 `cp .env.example .env`.

- 앱: http://localhost:5173/
- API 헬스: http://localhost:3000/api/health
- 랭킹: http://localhost:5173/ranking
- 채널 상세: http://localhost:5173/c/{username}
- 주간 변화: http://localhost:5173/weekly
- 비교: http://localhost:5173/compare
- 어드민: http://localhost:5173/admin — 아이디·비밀번호 로그인 (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`)

`STATS_CRON_ENABLED`는 로컬에서 `false`로 둔다. 수집은 GitHub Actions 또는 `POST /api/internal/stats/run`으로 돌린다.

## 관리자 로그인

브라우저 `/admin`은 아이디·비밀번호로 들어간다. 텔레그램 미니앱 관리자(`TELEGRAM_ADMIN_IDS`) 로그인은 그대로다.

```bash
cd backend
npm run admin:hash-password
```

비밀번호를 가려서 두 번 입력하면 bcrypt 해시만 출력된다. 그 값을 `.env`의 `ADMIN_PASSWORD_HASH`에 넣고 `ADMIN_USERNAME`을 정한다. 평문 비밀번호는 저장하지 않는다.

## 환경 변수

값은 저장소에 넣지 않는다. `backend/.env.example`, `frontend/.env.example`을 복사해 채운다.

**백엔드 (요약)**

- DB: `DATABASE_TYPE`, `DATABASE_PATH` (로컬), `DATABASE_URL` (운영 Postgres), `TYPEORM_SYNC`
- 인증: `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_IDS`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`
- 사이트: `PUBLIC_SITE_URL`
- 수집: `STATS_CRON_ENABLED`, `INTERNAL_CRON_TOKEN`
- 자동관리(선택): `SERPER_API_KEY`, `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`, `AI_API_KEY`(`AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `AI_DAILY_LIMIT`), `TGSTAT_API_TOKEN`

**프론트**

- `VITE_API_BASE_URL` — 예: `http://localhost:3000/api`
- `VITE_SITE_URL` — 공개 사이트 주소
- `VITE_TELEGRAM_BOT_USERNAME`

**Cloudflare Pages Functions (채널 SEO)**

- `API_BASE_URL` — API origin 또는 `…/api` (VITE_ 접두사 없음)

**GitHub Actions secrets**

- `NEWLINK_API_URL`, `INTERNAL_CRON_TOKEN`

## 배포

- API: Render (`render.yaml`). 첫 스키마 반영 후 `TYPEORM_SYNC=false` 권장
- 프론트: Cloudflare Pages. Functions가 `/c/:username`, `/sitemap.xml`을 처리
- 수집: Actions가 UTC 18:05에 run을 걸고, 5분마다 status로 깨운 뒤 끝날 때까지 대기 (최대 100분)

자세한 백엔드 배포는 `DEPLOY_RENDER.md`. 작업 스냅샷은 `CHECKPOINT.md`.
