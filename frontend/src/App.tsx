import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/admin/AdminLayout';
import { AppLayout } from './components/AppLayout';
import { AuthProvider } from './providers/AuthProvider';
import { AdminAutoManagePage } from './pages/admin/AdminAutoManagePage';
import { AdminAdsManagePage } from './pages/admin/AdminAdsManagePage';
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage';
import { AdminChannelRegisterPage } from './pages/admin/AdminChannelRegisterPage';
import { AdminCategoryLinksPage } from './pages/admin/AdminCategoryLinksPage';
import { AdminChannelsManagePage } from './pages/admin/AdminChannelsManagePage';
import { AdminGroupRegisterPage } from './pages/admin/AdminGroupRegisterPage';
import { AdminGroupsManagePage } from './pages/admin/AdminGroupsManagePage';
import { AdminPendingPage } from './pages/admin/AdminPendingPage';
import { AdminTonPaymentsPage } from './pages/admin/AdminTonPaymentsPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { HomePage } from './pages/HomePage';
import { MyPage } from './pages/MyPage';
import { RankingPage } from './pages/RankingPage';
import { SubmitPage } from './pages/SubmitPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="pending" replace />} />
          <Route path="pending" element={<AdminPendingPage />} />
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
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/search" element={<Navigate to="/ranking" replace />} />
          <Route path="/submit" element={<SubmitPage />} />
          <Route path="/my" element={<MyPage />} />
        </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}