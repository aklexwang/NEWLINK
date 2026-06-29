import { isAdminAuthenticated } from '../../utils/adminAccess';

export function AdminAuthNotice() {
  if (import.meta.env.DEV || isAdminAuthenticated()) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      배포 사이트에서는 관리자 인증이 필요합니다.{' '}
      <span className="font-medium">
        /admin?access=관리자키
      </span>
      로 먼저 접속한 뒤 자동관리를 사용해 주세요.
    </div>
  );
}
