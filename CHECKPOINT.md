# NEWLINK 체크포인트

**저장 일시:** 2025-06-20

## 이번 세션까지 완료된 작업

### 채널/그룹 유형
- `linkType` (channel | group) 백엔드·프론트 연동
- MY 페이지 제보 내역에 유형 뱃지 표시
- 회원 목록(`ChannelCard`)에 채널/그룹 뱃지 표시
- 어드민 채널·광고 관리에서 유형 수정

### 어드민
- 채널 관리: 테이블 + 펼치기 상세, 카테고리·유형 수정
- **채널 관리: 제목 직접 수정** (저장 버튼)
- 광고 관리 페이지 분리 (`/admin/ads`)
- 광고 의뢰자 정보(목업) 표시

### 회원 페이지 UI
- 홈 섹션 「인기 채널 ›」→「인기」
- **검색 카테고리: 애플워치식 허니콤 UI**
  - 원형 컬러 버블 + hex 그리드
  - fisheye 크기 변화, 드래그 관성
  - 흰색 배경, pill 라벨로 가독성 개선
  - 탭 선택 / 드래그 탐색

## 주요 파일

| 영역 | 파일 |
|------|------|
| 허니콤 UI | `frontend/src/components/CategoryHoneycomb.tsx` |
| 검색 | `frontend/src/pages/SearchPage.tsx` |
| 회원 목록 | `frontend/src/components/ChannelCard.tsx` |
| MY | `frontend/src/pages/MyPage.tsx` |
| 어드민 채널 | `frontend/src/pages/admin/AdminChannelsManagePage.tsx` |
| 어드민 광고 | `frontend/src/pages/admin/AdminAdsManagePage.tsx` |
| 유형 유틸 | `frontend/src/utils/linkType.ts` |

## 실행 방법

```bash
# Backend (port 3000)
cd backend && npm run start:dev

# Frontend (port 5173)
cd frontend && npm run dev
```

- 앱: http://localhost:5173/
- 검색(허니콤): http://localhost:5173/search
- 어드민 채널: http://localhost:5173/admin/channels
- 어드민 광고: http://localhost:5173/admin/ads

## 로컬 설정

- `DEV_ADMIN_BYPASS=true`
- `VITE_DEV_ADMIN=true`
- SQLite 사용 (Docker/PostgreSQL 불필요)
