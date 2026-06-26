import { AdminLinksManagePage } from './AdminLinksManagePage';

export function AdminChannelsManagePage() {
  return (
    <AdminLinksManagePage
      linkType="channel"
      title="채널 관리"
      subtitle="텔레그램 채널만 관리합니다."
      emptyMessage="등록된 채널이 없습니다."
      registerPath="/admin/channels/register"
      itemLabel="채널"
    />
  );
}
