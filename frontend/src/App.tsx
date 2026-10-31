import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { NewVersionBanner } from './components/NewVersionBanner';
import { MiniAppOnlyNotice } from './components/MiniAppOnlyNotice';
import { AuthProvider } from './providers/AuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { AppToastProvider } from './providers/AppToastProvider';
import { CategoriesPage } from './pages/CategoriesPage';
import { HomePage } from './pages/HomePage';
import type { ReactNode } from 'react';
import { importWithReload } from './utils/chunkReload';

// 첫 화면(홈·카테고리) 말고는 필요할 때 불러온다. 차트(recharts)·TON 지갑이 무거워서
const ChannelDetailPage = lazy(
  importWithReload(() => import('./pages/ChannelDetailPage').then((m) => ({ default: m.ChannelDetailPage }))),
);
const ComparePage = lazy(importWithReload(() => import('./pages/ComparePage').then((m) => ({ default: m.ComparePage }))));
const FavoritesPage = lazy(importWithReload(() => import('./pages/FavoritesPage').then((m) => ({ default: m.FavoritesPage }))));
const MyPage = lazy(importWithReload(() => import('./pages/MyPage').then((m) => ({ default: m.MyPage }))));
const RankingPage = lazy(importWithReload(() => import('./pages/RankingPage').then((m) => ({ default: m.RankingPage }))));
const WeeklyPage = lazy(importWithReload(() => import('./pages/WeeklyPage').then((m) => ({ default: m.WeeklyPage }))));
const SubmitRoute = lazy(importWithReload(() => import('./pages/SubmitRoute')));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="min-h-[60vh]" />}>{children}</Suspense>;
}

const AdminRoutes = lazy(importWithReload(() => import('./admin/AdminRoutes')));

export default function App() {
  return (
    <BrowserRouter>
      <AppToastProvider>
        <AppErrorBoundary>
            <ThemeProvider>
            <AuthProvider>
              <Routes>
                <Route path="/admin/channels/register" element={<Navigate to="/admin/register-link" replace />} />
                <Route path="/admin/groups/register" element={<Navigate to="/admin/register-link" replace />} />
                <Route path="/admin/register" element={<Navigate to="/admin/register-link" replace />} />
                <Route path="/admin/channels" element={<Navigate to="/admin/links?type=channel" replace />} />
                <Route path="/admin/groups" element={<Navigate to="/admin/links?type=group" replace />} />
                <Route path="/admin/by-category" element={<Navigate to="/admin/links" replace />} />
                <Route path="/admin/auto-manage" element={<Navigate to="/admin/discovery" replace />} />
                <Route path="/admin/rewards" element={<Navigate to="/admin/pending?tab=settings" replace />} />
                <Route path="/admin/ton-payments" element={<Navigate to="/admin/pending?tab=ledger" replace />} />
                <Route
                  path="/admin/*"
                  element={
                    <Suspense fallback={<div className="min-h-screen bg-[#f1f5f9]" />}>
                      <AdminRoutes />
                    </Suspense>
                  }
                />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/c/id/:id" element={<Lazy><ChannelDetailPage /></Lazy>} />
                  <Route path="/c/:username" element={<Lazy><ChannelDetailPage /></Lazy>} />
                  <Route path="/ranking" element={<Lazy><RankingPage /></Lazy>} />
                  <Route path="/weekly" element={<Lazy><WeeklyPage /></Lazy>} />
                  <Route path="/compare" element={<Lazy><ComparePage /></Lazy>} />
                  <Route path="/search" element={<Navigate to="/" replace />} />
                  <Route path="/favorites" element={<Lazy><FavoritesPage /></Lazy>} />
                  <Route path="/submit" element={<Lazy><SubmitRoute /></Lazy>} />
                  <Route path="/my" element={<Lazy><MyPage /></Lazy>} />
                </Route>
              </Routes>
              <NewVersionBanner />
              <MiniAppOnlyNotice />
            </AuthProvider>
            </ThemeProvider>
        </AppErrorBoundary>
      </AppToastProvider>
    </BrowserRouter>
  );
}
