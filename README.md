# NEWLINK

텔레그램 미니앱 — 채널/그룹 제보·검색 서비스

## 구조

- `frontend/` — React + Vite (회원 페이지)
- `backend/` — NestJS + SQLite/PostgreSQL (API)

## 로컬 실행

```bash
# Backend
cd backend
cp .env.example .env   # Windows: copy .env.example .env
npm install
npm run start:dev

# Frontend
cd frontend
cp .env.example .env
npm install
npm run dev
```

- 앱: http://localhost:5173/
- API: http://localhost:3000/api

## 배포 (회원 페이지)

- **Netlify:** Base directory `frontend`, publish `dist`
- 환경 변수: `VITE_API_BASE_URL=https://your-api-url/api`

## 환경 변수

`backend/.env.example`, `frontend/.env.example` 참고
