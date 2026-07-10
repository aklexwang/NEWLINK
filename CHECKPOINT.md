# NEWLINK 체크포인트

**저장 일시:** 2026-07-10

**Git 커밋:** `6e3a1e4` (origin/main 동기화 완료)

## 이번 세션까지 완료된 작업

### 어드민 · 광고 관리
- **노출 순서 드래그앤드롭** — ⋮⋮ 핸들로 순서 변경, `promotionSortOrder` 저장
- **종료일 확인 버튼** — 날짜 변경 후 「확인」 클릭 시 즉시 적용
- API: `PATCH /admin/promotions/order`

### 인증 · 회원
- Telegram 미니앱 `initData` 자동 로그인 + JWT
- 로컬 브라우저: MY 슬라이드 데모 로그인 (임의 회원 ID)
- TON 지갑: 제보 시 1회 등록
- 회원 API: `X-Demo-Telegram-Id` (관리자 `X-Dev-Admin`과 분리)

### 어드민 기타
- 사이드바 광고 배지: 노출 중만 집계
- TON 지급 이력 (데모, localStorage)
- 관리자 페이지 게이트 (비밀번호 `123` + API 키)

### 배포
- 프론트: https://newlink-bez.pages.dev
- API: Cloudflare 터널 → PC 백엔드 `localhost:3000`
- 어드민: `/admin?access=newlink-admin-kc2026`

## 미완료 (다음 작업)
- [Telegram Login (OIDC)](https://core.telegram.org/bots/telegram-login) 웹 브라우저 로그인 — 아직 미구현

## 주요 파일

| 영역 | 파일 |
|------|------|
| 광고 순서·기간 | `frontend/src/pages/admin/AdminAdsManagePage.tsx` |
| 광고 순서 API | `backend/src/channels/channels.service.ts` |
| 광고 순서 엔드포인트 | `backend/src/admin/admin-promotions.controller.ts` |
| 인증 | `frontend/src/providers/AuthProvider.tsx` |
| MY | `frontend/src/pages/MyPage.tsx` |
| 어드민 게이트 | `frontend/src/components/AdminPageGate.tsx` |

## 실행 방법

```bash
# Backend (port 3000)
cd backend && npm run start:prod

# Frontend (port 5173)
cd frontend && npm run dev
```

- 앱: http://localhost:5173/
- MY: http://localhost:5173/my
- 어드민 광고: http://localhost:5173/admin/ads

## 로컬 설정

- `DEV_ADMIN_BYPASS=true`
- `VITE_DEV_ADMIN=true`
- `ADMIN_ACCESS_KEY=newlink-admin-kc2026`
- SQLite: `backend/data/newlink.sqlite`

## 최근 커밋

```
6e3a1e4 광고 관리 종료일 수정 후 확인 버튼으로 즉시 적용
614e953 광고 관리에서 드래그로 노출 순서를 변경·저장할 수 있게 추가
a5a06e4 Telegram 자동 로그인, MY 슬라이드 로그인, TON 지갑 제보 시 등록...
```
