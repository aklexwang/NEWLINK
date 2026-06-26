import { AdminLinkRegisterPage } from './AdminLinkRegisterPage';

export function AdminGroupRegisterPage() {
  return (
    <AdminLinkRegisterPage
      linkType="group"
      title="그룹 등록"
      subtitle="텔레그램 그룹/방 링크로 찾아 바로 등록합니다."
      itemLabel="그룹"
      managePath="/admin/groups"
      placeholder="그룹 링크 또는 초대 링크"
    />
  );
}
