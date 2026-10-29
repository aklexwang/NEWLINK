# NEWLINK 체크포인트

## 2026-10-29 작업 기록 (전부 main 배포 완료)

- 밤사이 결과: 비공개 초대 링크 자동 검사로 비공개 채널 5→61, 비공개 그룹 6→90 (오늘 자동 등록 181). 검사 대기 링크는 눈덩이로 518개로 늘어 계속 처리 중
- 새 프리미엄 계정 MTProto 정상 (요청 420, FLOOD_WAIT 없음, 429 없음)
- light 회차 앞부분(최대 5분·60개)에 새 그룹·초대방 첫 수집 → 낮에 들어온 방도 몇 시간 안에 회원 노출 (실패는 12시간 뒤 재시도, `LIGHT_FIRST_COLLECT_MAX`)
- 언어 판별: 제목·소개가 한국어면 게시글/그룹 대화가 외국어여도 외국어로 숨기지 않음 (새벽 full 의 전체 재판정으로 기존 숨김도 풀림)
- 분류대기 AI 재분류: 매주 월 → 매일 KST 05:20 (AI 하루 한도 안)
- 키워드 검색: 하루 10→20회 기본값, 한국어 키워드 66개 추가(`app_settings` `discovery-keywords:seed-v2` 로 한 번만). Render 에 `KEYWORD_SEARCH_DAILY_LIMIT` 가 있으면 그 값이 우선
- 비공개 채널 자동 가입(사용자 결정): `messages.ImportChatInvite` 허용. 채널형·승인 불필요 초대만, 하루 15(`MTPROTO_JOIN_DAILY`, 0=끔)·전체 950·간격 3분. 수집 운영 화면에 "비공개 채널 가입" 카드
- 회원 화면 첫 로딩 1.28MB → 약 410KB (상세·비교·랭킹·주간·즐겨찾기·MY·제보를 필요할 때 불러옴, TON 지갑은 제보·어드민 지급 화면만)
- 회원 카드(카테고리·랭킹·즐겨찾기·검색)에 공/비 표시, 단건 등록에 개인 계정·봇 주소 안내
- render.yaml: 실제 유료 플랜(starter / basic-256mb·1GB)으로 맞춤

### 다음에 볼 것
1. 내일 아침: 비공개 채널 가입 수·FLOOD_WAIT, 회원 페이지 숨김 313 이 줄었는지(언어 판별 변경), 분류대기 05:20 결과
2. 새 계정 일주일 무사하면 resolve 한도 50 → 80~100
3. 대량 등록 재료 출처 찾기 (tele.wiki 긁기 금지)

## 2026-10-27 작업 기록 (전부 main 배포 완료)

- 오늘 숫자(AI 분류·MTProto 요청·t.me/봇 429) DB 저장 → 서버 재시작해도 이어짐 (`app_settings` 의 `daily:*`)
- 노출 켜기: 외국어 판정도 해제(한국어 고정), 아직 수집 안 된 방은 즉시 수집, 남는 방은 이유 안내 / 목록에 숨김 이유 표시
- 대량 등록: 진행률 %, 5개씩 등록 + 진행 표시, 남은 정상 항목 있으면 "계속 등록하시겠습니까?", 다 끝나면 "등록이 완료되었습니다" 요약 후 확인 목록 삭제
- 대시보드: 링크 등록(어드민) 카드에 회원 노출·숨김 수 / 성인 카테고리 방은 숨김이 아니라 노출로 집계
- 회원 화면: "전체" 숫자에 성인 포함(목록은 성인 선택 시만), 검색어가 있으면 성인 방도 검색됨(노출 2,002개 = 검색 대상)
- 회원 검색: 결과 옆 개수 배지 + 더 보기
- 업로드 이미지(카테고리 아이콘·방 프로필) DB 저장 (`stored_images`, `/api/images/:id`) — 배포해도 안 깨짐. 기존 깨진 아이콘은 다시 올려야 함
- 회원 관리 상태: 미가입/가입완료 → "로그인만 · 지갑 없음" / "지갑 등록"
- 채널·그룹 관리 카테고리 칩: 크게 + 마우스 올리면 확대

### 2026-10-28 할 일: 방 늘리기 연구
1. 새벽 수집 결과 확인 (오늘 자동 등록 수, 노출 수 — 10/27 밤 2,002)
2. 분류대기 ~110개 처리 (AI 재분류 / 일괄 지정)
3. 새로 들어온 그룹도 낮 수집에서 첫 수집 (MTProto 한도 고려)
4. 자동 발견 확대: 게시글 속 링크 추적, 한국어 키워드 목록 확장
5. 대량 등록 재료 출처 찾기 (tele.wiki 긁기 금지)
6. 외국어로 잘못 숨겨진 한국 방 점검


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
| `ADMIN_USERNAME` | 브라우저 `/admin` 로그인 아이디 |
| `ADMIN_PASSWORD_HASH` | 관리자 비밀번호 bcrypt 해시 (`npm run admin:hash-password`, 평문 저장 금지) |
| `DEV_ADMIN_BYPASS` | 로컬 관리자 우회 (운영 false) |
| `STATS_CRON_ENABLED` | 프로세스 내부 매일 03:00 KST 크론 |
| `INTERNAL_CRON_TOKEN` | `X-Internal-Token` (수집 run/status) |
| `SERPER_API_KEY` | 자동관리 검색 (권장) |
| `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_CX` | Google CSE 폴백 |
| `AI_PROVIDER` / `AI_API_KEY` / `AI_MODEL` / `AI_BASE_URL` / `AI_DAILY_LIMIT` | AI 카테고리 분류 (선택, 기본 deepseek). 예전 `OPENAI_API_KEY` 도 계속 동작 |
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
- 어드민: http://localhost:5173/admin (아이디·비밀번호. 해시는 `npm run admin:hash-password`)
