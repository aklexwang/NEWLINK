import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';
import { AdminDiscoveryPage } from '../pages/admin/AdminDiscoveryPage';
import { AdminAdsManagePage } from '../pages/admin/AdminAdsManagePage';
import { AdminCategoriesPage } from '../pages/admin/AdminCategoriesPage';
import { AdminManualRegisterPage } from '../pages/admin/AdminManualRegisterPage';
import { AdminCollectOpsPage } from '../pages/admin/AdminCollectOpsPage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminLinksManagePage } from '../pages/admin/AdminLinksManagePage';
import { AdminPendingPage } from '../pages/admin/AdminPendingPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="collect" element={<AdminCollectOpsPage />} />
        <Route path="links" element={<AdminLinksManagePage />} />
        <Route path="pending" element={<AdminPendingPage />} />
        <Route path="register-link" element={<AdminManualRegisterPage />} />
        <Route path="discovery" element={<AdminDiscoveryPage />} />
        <Route path="ads" element={<AdminAdsManagePage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="users" element={<AdminUsersPage />} />
      </Route>
    </Routes>
  );
}
