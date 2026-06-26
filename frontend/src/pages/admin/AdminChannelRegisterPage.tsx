import { AdminLinkRegisterPage } from './AdminLinkRegisterPage';

export function AdminChannelRegisterPage() {
  return (
    <AdminLinkRegisterPage
      linkType="channel"
      title="채널 등록"
      subtitle="텔레그램 채널 링크로 찾아 바로 등록합니다."
      itemLabel="채널"
      managePath="/admin/channels"
      placeholder="채널 링크 또는 @username"
    />
  );
}
