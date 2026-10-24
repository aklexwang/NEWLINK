import { Navigate } from 'react-router-dom';

export function AdminTonPaymentsPage() {
  return <Navigate to="/admin/pending?tab=ledger" replace />;
}
