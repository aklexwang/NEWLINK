import { AdminLinksManagePage } from './AdminLinksManagePage';

export function AdminGroupsManagePage() {
  return (
    <AdminLinksManagePage
      linkType="group"
      title="그룹 관리"
      subtitle="텔레그램 그룹/방만 관리합니다."
      emptyMessage="등록된 그룹이 없습니다."
      registerPath="/admin/groups/register"
      itemLabel="그룹"
    />
  );
}
