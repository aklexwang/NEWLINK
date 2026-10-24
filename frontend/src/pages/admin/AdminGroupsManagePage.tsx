import { Navigate } from 'react-router-dom';

export function AdminGroupsManagePage() {
  return <Navigate to="/admin/links?type=group" replace />;
}
