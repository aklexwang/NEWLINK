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
import { AdminServerStatusPage } from '../pages/admin/AdminServerStatusPage';
import { AdminFeedFilterPage } from '../pages/admin/AdminFeedFilterPage';
import { TonConnectProvider } from '../providers/TonConnectProvider';

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
        {/* TON 지갑 연결은 보상 지급 화면에서만 쓴다 (회원 화면 첫 로딩을 가볍게) */}
        <Route
          path="pending"
          element={
            <TonConnectProvider>
              <AdminPendingPage />
            </TonConnectProvider>
          }
        />
        <Route path="register-link" element={<AdminManualRegisterPage />} />
        <Route path="discovery" element={<AdminDiscoveryPage />} />
        <Route path="ads" element={<AdminAdsHubPage />} />
        <Route path="search-insights" element={<AdminSearchInsightsPage />} />
        <Route path="opens" element={<AdminOpensPage />} />
        <Route path="search-terms" element={<AdminSearchTermsPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="server" element={<AdminServerStatusPage />} />
        <Route path="feed-filter" element={<AdminFeedFilterPage />} />
      </Route>
    </Routes>
  );
}
