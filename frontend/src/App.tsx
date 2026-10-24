import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/admin/AdminLayout';
import { AppLayout } from './components/AppLayout';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AuthProvider } from './providers/AuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { AppToastProvider } from './providers/AppToastProvider';
import { TonConnectProvider } from './providers/TonConnectProvider';
import { AdminAutoManagePage } from './pages/admin/AdminAutoManagePage';
import { AdminAdsManagePage } from './pages/admin/AdminAdsManagePage';
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage';
import { AdminChannelRegisterPage } from './pages/admin/AdminChannelRegisterPage';
import { AdminCategoryLinksPage } from './pages/admin/AdminCategoryLinksPage';
import { AdminChannelsManagePage } from './pages/admin/AdminChannelsManagePage';
import { AdminGroupRegisterPage } from './pages/admin/AdminGroupRegisterPage';
import { AdminGroupsManagePage } from './pages/admin/AdminGroupsManagePage';
import { AdminManualRegisterPage } from './pages/admin/AdminManualRegisterPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminLinksManagePage } from './pages/admin/AdminLinksManagePage';
import { AdminPendingPage } from './pages/admin/AdminPendingPage';
import { AdminTonPaymentsPage } from './pages/admin/AdminTonPaymentsPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { ChannelDetailPage } from './pages/ChannelDetailPage';
import { ComparePage } from './pages/ComparePage';
import { CategoriesPage } from './pages/CategoriesPage';
import { HomePage } from './pages/HomePage';
import { FavoritesPage } from './pages/FavoritesPage';
import { MyPage } from './pages/MyPage';
import { RankingPage } from './pages/RankingPage';
import { SubmitPage } from './pages/SubmitPage';
import { WeeklyPage } from './pages/WeeklyPage';

export default function App() {
  return (
    <BrowserRouter>
      <AppToastProvider>
        <AppErrorBoundary>
          <TonConnectProvider>
            <ThemeProvider>
            <AuthProvider>
              <Routes>
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboardPage />} />
                  <Route path="links" element={<AdminLinksManagePage />} />
                  <Route path="pending" element={<AdminPendingPage />} />
                  <Route path="register-link" element={<AdminManualRegisterPage />} />
                  <Route path="auto-manage" element={<AdminAutoManagePage />} />
                  <Route path="by-category" element={<AdminCategoryLinksPage />} />
                  <Route path="register" element={<Navigate to="channels/register" replace />} />
                  <Route path="channels/register" element={<AdminChannelRegisterPage />} />
                  <Route path="channels" element={<AdminChannelsManagePage />} />
                  <Route path="groups/register" element={<AdminGroupRegisterPage />} />
                  <Route path="groups" element={<AdminGroupsManagePage />} />
                  <Route path="ads" element={<AdminAdsManagePage />} />
                  <Route path="categories" element={<AdminCategoriesPage />} />
                  <Route path="ton-payments" element={<AdminTonPaymentsPage />} />
                  <Route path="users" element={<AdminUsersPage />} />
                </Route>
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
            </AuthProvider>
            </ThemeProvider>
          </TonConnectProvider>
        </AppErrorBoundary>
      </AppToastProvider>
    </BrowserRouter>
  );
}
