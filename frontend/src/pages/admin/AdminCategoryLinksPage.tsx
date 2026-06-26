import { AdminLinksManagePage } from './AdminLinksManagePage';

export function AdminCategoryLinksPage() {
  return (
    <AdminLinksManagePage
      title="카테고리별"
      subtitle="카테고리를 선택하면 채널과 그룹을 한눈에 볼 수 있습니다."
      emptyMessage="해당 카테고리에 등록된 항목이 없습니다."
      registerPaths={{
        channel: '/admin/channels/register',
        group: '/admin/groups/register',
      }}
      itemLabel="항목"
      showTypeColumn
    />
  );
}
