import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from '../components/admin/AdminLayout';
import { AdminDiscoveryPage } from '../pages/admin/AdminDiscoveryPage';
import { AdminAdsHubPage } from '../pages/admin/AdminAdsHubPage';
import { AdminCategoriesPage } from '../pages/admin/AdminCategoriesPage';
import { AdminManualRegisterPage } from '../pages/admin/AdminManualRegisterPage';
import { AdminCollectOpsPage } from '../pages/admin/AdminCollectOpsPage';
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminLinksManagePage } from '../pages/admin/AdminLinksManagePage';
import { AdminPendingPage } from '../pages/admin/AdminPendingPage';
import { AdminOpensPage } from '../pages/admin/AdminOpensPage';
import { AdminSearchInsightsPage } from '../pages/admin/AdminSearchInsightsPage';
import { AdminSearchTermsPage } from '../pages/admin/AdminSearchTermsPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';
import { AdminCollectorToolPage } from '../pages/admin/AdminCollectorToolPage';

export default function AdminRoutes() {
  return (
    <Routes>
      {/* 수집기: 어드민 화면 밖 새 창 */}
      <Route path="collector" element={<AdminCollectorToolPage />} />
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="collect" element={<AdminCollectOpsPage />} />
        <Route path="links" element={<AdminLinksManagePage />} />
        <Route path="pending" element={<AdminPendingPage />} />
        <Route path="register-link" element={<AdminManualRegisterPage />} />
        <Route path="discovery" element={<AdminDiscoveryPage />} />
        <Route path="ads" element={<AdminAdsHubPage />} />
        <Route path="search-insights" element={<AdminSearchInsightsPage />} />
        <Route path="opens" element={<AdminOpensPage />} />
        <Route path="search-terms" element={<AdminSearchTermsPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="users" element={<AdminUsersPage />} />
      </Route>
    </Routes>
  );
}
