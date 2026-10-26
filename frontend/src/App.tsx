import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { NewVersionBanner } from './components/NewVersionBanner';
import { AuthProvider } from './providers/AuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { AppToastProvider } from './providers/AppToastProvider';
import { TonConnectProvider } from './providers/TonConnectProvider';
import { ChannelDetailPage } from './pages/ChannelDetailPage';
import { ComparePage } from './pages/ComparePage';
import { CategoriesPage } from './pages/CategoriesPage';
import { HomePage } from './pages/HomePage';
import { FavoritesPage } from './pages/FavoritesPage';
import { MyPage } from './pages/MyPage';
import { RankingPage } from './pages/RankingPage';
import { SubmitPage } from './pages/SubmitPage';
import { WeeklyPage } from './pages/WeeklyPage';

const AdminRoutes = lazy(() => import('./admin/AdminRoutes'));

export default function App() {
  return (
    <BrowserRouter>
      <AppToastProvider>
        <AppErrorBoundary>
          <TonConnectProvider>
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
                  <Route path="/c/id/:id" element={<ChannelDetailPage />} />
                  <Route path="/c/:username" element={<ChannelDetailPage />} />
                  <Route path="/ranking" element={<RankingPage />} />
                  <Route path="/weekly" element={<WeeklyPage />} />
                  <Route path="/compare" element={<ComparePage />} />
                  <Route path="/search" element={<Navigate to="/" replace />} />
                  <Route path="/favorites" element={<FavoritesPage />} />
                  <Route path="/submit" element={<SubmitPage />} />
                  <Route path="/my" element={<MyPage />} />
                </Route>
              </Routes>
              <NewVersionBanner />
            </AuthProvider>
            </ThemeProvider>
          </TonConnectProvider>
        </AppErrorBoundary>
      </AppToastProvider>
    </BrowserRouter>
  );
}
