# NEWLINK 백엔드 상시 배포 (Render)

PC Nest + Cloudflare 터널 대신, Render에 API를 올려 두면 PC를 꺼도 미니앱이 동작합니다.

## 비용 (대략)

| 항목 | 플랜 | 역할 |
|------|------|------|
| Web Service | **Starter** (~$7/월) | Nest API 상시 가동 (Free는 15분 뒤 잠듦) |
| PostgreSQL | **Basic 256MB** (~$6/월) | 데이터 영구 저장 (디스크 SQLite는 재배포 시 유실) |

무료 Web은 “켜져 있는 것처럼” 보이지만 잠들었다가 첫 요청에 수십 초 지연됩니다. 미니앱용이면 Starter를 권장합니다.

## 1) 코드 준비 (이미 반영됨)

- `render.yaml` — Blueprint 배포 정의
- `DATABASE_URL` + PostgreSQL 지원
- `TYPEORM_SYNC=true` — 첫 배포 시 테이블 자동 생성
- `/api/health` 헬스체크

## 2) Render에서 배포

1. https://dashboard.render.com 로그인
2. **New → Blueprint**
3. GitHub 저장소 `aklexwang/NEWLINK` 연결 (이 브랜치 `main`)
4. Blueprint가 `render.yaml`을 읽으면 `newlink-api` + `newlink-db`가 생성됩니다
5. **Environment**에서 아래 값을 직접 입력 (`sync: false` 항목):

| 키 | 값 예시 |
|----|---------|
| `ADMIN_ACCESS_KEY` | 지금 쓰는 관리자 키 |
| `TELEGRAM_BOT_TOKEN` | BotFather 토큰 |
| `TELEGRAM_ADMIN_IDS` | 관리자 텔레그램 숫자 ID |
| `SERPER_API_KEY` | (선택) Serper 키 |
| `OPENAI_API_KEY` | (선택) OpenAI 키 |
| `TGSTAT_API_TOKEN` | (선택) |

6. Deploy 완료 후 서비스 URL 확인  
   예: `https://newlink-api.onrender.com`

7. 브라우저에서 확인:

```text
https://newlink-api.onrender.com/api/health
```

`{"status":"ok"}` 이면 성공입니다.

## 3) 프론트 API 주소 변경

`frontend/.env.production` 을 배포 URL로 바꿉니다:

```env
VITE_API_BASE_URL=https://newlink-api.onrender.com/api
VITE_SITE_URL=https://global-spay.com
VITE_TELEGRAM_BOT_USERNAME=newlinkcom_bot
VITE_TELEGRAM_BOT_ID=8863933040
```

그다음 프론트를 다시 빌드·배포합니다 (Cloudflare Pages).

## 4) 스키마 안정화

첫 배포·카테고리 시드가 끝난 뒤 Render 환경변수에서:

```text
TYPEORM_SYNC=false
```

로 바꾸고 재배포하세요. (실수로 컬럼이 날아가는 일을 막습니다)

## 5) 로컬 데이터 이전

Render Postgres는 **빈 DB**로 시작합니다. 카테고리 기본값은 서버가 자동 생성합니다.

- 채널/회원은 어드민에서 다시 등록하거나
- 로컬 SQLite → Postgres 이전 스크립트가 필요하면 말해 주세요

## 6) 터널은?

Render API가 정상 확인되면 **cloudflared 터널은 꺼도 됩니다.**  
로컬 `npm run start:dev`는 개발할 때만 쓰면 됩니다.

## 문제 해결

| 증상 | 확인 |
|------|------|
| Deploy 실패 (native module) | Build 로그에서 `better-sqlite3` — 보통 Render Node 빌드 이미지로 통과합니다 |
| 502 / Application failed | Logs에서 DB 연결·`JWT_SECRET`·`TELEGRAM_BOT_TOKEN` 누락 확인 |
| 헬스체크 실패 | `/api/health` 가 200인지, 시작 로그에 `listening` 있는지 |
| CORS | 현재 `origin: true` 허용. 커스텀 도메인만 막을 필요는 없음 |
