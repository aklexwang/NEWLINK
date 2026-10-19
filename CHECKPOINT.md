# NEWLINK 체크포인트

**저장 일시:** 2026-10-19

## 이번에 추가된 기능

- **관측 수집기** — `t.me/s` HTML 파싱 + Bot API 폴백, 게시글·스냅샷·이벤트 저장, 오래된 글 정리
- **지표·점수** — KST 일일 스냅샷, 백분위·등급, 조작 의심 플래그, 채널 배지
- **랭킹 정렬** — 종합/구독자/조회율/급상승/성장/활동/신규, 채널·그룹 토글, 데이터 부족 숨기기, 인증 채널만, 14일 스파크라인
- **채널 상세** — `/c/:username` (구독자 추이, 게시글, 변경 기록, 비교 담기)
- **주간 변화** — `/weekly` (이름·아이디 변경, 새로 관측, 순위 상승)
- **비교** — `/compare` (localStorage 최대 3개, 표 + 30일 구독자 겹친 차트)
- **SEO** — Cloudflare Pages Functions로 `/c/:username` 메타·JSON-LD, `/sitemap.xml` 프록시, `robots.txt`
- **운영자 인증** — 봇을 관리자로 넣은 뒤 `POST /api/channels/:id/verify`. 매일 수집 후 재확인, 권한 상실 시 `unverified` 이벤트
- **수집 깨우기** — GitHub Actions가 `GET /api/internal/stats/status`를 5분마다 호출해 Render Free가 수집 중 잠들지 않게 함

## 환경 변수 (이름과 용도만)

값은 `.env`에만 둔다. 이 문서에 키·토큰을 쓰지 않는다.

### backend

| 이름 | 용도 |
|------|------|
| `PORT` | API 포트 |
| `NODE_ENV` | 실행 환경 |
| `PUBLIC_SITE_URL` | 사이트맵·canonical 공개 도메인 |
| `DATABASE_TYPE` / `DATABASE_PATH` | 로컬 SQLite |
| `DATABASE_URL` | 운영 PostgreSQL 연결 문자열 |
| `TYPEORM_SYNC` | 스키마 자동 동기화 (운영 안정화 후 false) |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | 미니앱 JWT |
| `TELEGRAM_BOT_TOKEN` | 봇 API·initData 검증·운영자 인증 |
| `TELEGRAM_ADMIN_IDS` | 관리자 텔레그램 숫자 ID |
| `TELEGRAM_BOT_USERNAME` | 봇 공개 username (인증 안내) |
| `TELEGRAM_CLIENT_ID` | 텔레그램 웹 로그인 Client ID (선택) |
| `ADMIN_ACCESS_KEY` | 브라우저 `/admin?access=` 게이트 |
| `DEV_ADMIN_BYPASS` | 로컬 관리자 우회 (운영 false) |
| `STATS_CRON_ENABLED` | 프로세스 내부 매일 03:00 KST 크론 |
| `INTERNAL_CRON_TOKEN` | `X-Internal-Token` (수집 run/status) |
| `SERPER_API_KEY` | 자동관리 검색 (권장) |
| `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_CX` | Google CSE 폴백 |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | 후보 카테고리 분류 (선택) |
| `TGSTAT_API_TOKEN` | TGStat 랭킹·동기화 (선택) |
| `TELEGRAM_PAYMENT_PROVIDER_TOKEN` 등 | TON 프로모션 (미사용 시 더미) |

### frontend / Cloudflare Pages

| 이름 | 용도 |
|------|------|
| `VITE_API_BASE_URL` | 브라우저 API (`…/api`) |
| `VITE_SITE_URL` | 공유·canonical 사이트 주소 |
| `VITE_TELEGRAM_BOT_USERNAME` | 로그인 위젯·인증 안내 |
| `VITE_TELEGRAM_BOT_ID` | Telegram Login bot_id (선택) |
| `API_BASE_URL` | Pages Functions SEO용 API (VITE_ 없음) |

### GitHub Actions

| 이름 | 용도 |
|------|------|
| `NEWLINK_API_URL` | 수집을 걸 API origin |
| `INTERNAL_CRON_TOKEN` | 내부 크론 토큰 (backend와 동일) |

## 배포 구성

- **API:** Render Web + PostgreSQL (`render.yaml`, 헬스체크 `/api/health`)
- **프론트:** Cloudflare Pages (React SPA + `functions/` SEO·사이트맵)
- **수집 크론:** GitHub Actions `.github/workflows/stats-cron.yml` — UTC 18:05(KST 03:05)에 `POST /api/internal/stats/run` 후 status로 최대 100분 대기

로컬 DB는 SQLite (`backend/data/newlink.sqlite`). 운영은 `DATABASE_URL` Postgres.

## 다음 할 일

- 운영 배포 (Render 환경변수·마이그레이션, Pages `API_BASE_URL`)
- Google Search Console 등록 (`https://global-spay.com/sitemap.xml`)

## 실행 방법

```bash
cd backend
copy .env.example .env
npm install
npm run start:dev

cd frontend
copy .env.example .env
npm install
npm run dev
```

- 앱: http://localhost:5173/
- 랭킹: http://localhost:5173/ranking
- 채널 상세: http://localhost:5173/c/{username}
- 어드민: http://localhost:5173/admin (`ADMIN_ACCESS_KEY`는 `.env` 참고)
