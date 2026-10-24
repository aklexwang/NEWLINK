import { Navigate } from 'react-router-dom';

export function AdminChannelsManagePage() {
  return <Navigate to="/admin/links?type=channel" replace />;
}
