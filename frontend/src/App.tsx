import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/admin/AdminLayout';
import { AppLayout } from './components/AppLayout';
import { AdminAdsManagePage } from './pages/admin/AdminAdsManagePage';
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage';
import { AdminChannelsManagePage } from './pages/admin/AdminChannelsManagePage';
import { AdminPendingPage } from './pages/admin/AdminPendingPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { HomePage } from './pages/HomePage';
import { MyPage } from './pages/MyPage';
import { SearchPage } from './pages/SearchPage';
import { SubmitPage } from './pages/SubmitPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="pending" replace />} />
          <Route path="pending" element={<AdminPendingPage />} />
          <Route path="channels" element={<AdminChannelsManagePage />} />
          <Route path="ads" element={<AdminAdsManagePage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="users" element={<AdminUsersPage />} />
        </Route>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/submit" element={<SubmitPage />} />
          <Route path="/my" element={<MyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}