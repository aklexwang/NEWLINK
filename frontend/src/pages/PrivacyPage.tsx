import { useNavigate } from 'react-router-dom';

/**
 * 개인정보 처리방침 (초안 · 2026-11-03). 법률 자문 후 다듬기로 함.
 * 실제로 모으는 항목과 맞춰 둘 것: 텔레그램 ID·이름·@아이디·언어·프리미엄 여부·방문 날짜(비회원 포함),
 * 로그인 회원 이용 기록(검색어·본 채널·카테고리·즐겨찾기), 제보·보상(지갑 주소). 전화번호 없음.
 */
export function PrivacyPage() {
  const navigate = useNavigate();
  const sections: Array<{ title: string; body: string[] }> = [
    {
      title: '1. 수집하는 정보',
      body: [
        '미니앱을 열면 텔레그램이 전달하는 정보: 텔레그램 ID(숫자), 이름, 사용자명(@아이디), 언어 설정, 프리미엄 여부, 방문한 날짜와 방문한 날 수',
        '로그인한 회원: 위 정보와 함께 즐겨찾기, 제보 내역, 서비스 이용 기록(검색어, 열어 본 채널·카테고리)',
        '제보 보상을 받는 회원: 보상을 받을 지갑 주소',
        '전화번호, 연락처, 텔레그램 대화 내용은 수집하지 않습니다.',
      ],
    },
    {
      title: '2. 이용 목적',
      body: [
        '채널·그룹 검색, 즐겨찾기, 제보 등 서비스 제공',
        '목록을 대량으로 긁어 가는 등 부정 이용 방지',
        '이용 통계와 서비스 개선, 회원 관심사에 맞는 추천',
        '제보 보상 지급',
      ],
    },
    {
      title: '3. 보관 기간',
      body: [
        '방문 기록과 이용 기록은 마지막 이용 후 90일이 지나면 자동으로 삭제합니다.',
        '회원 정보는 탈퇴하면 지체 없이 삭제합니다. 다만 법령에서 보관하도록 정한 정보는 그 기간 동안 보관합니다.',
      ],
    },
    {
      title: '4. 제3자 제공 · 처리 위탁 · 국외 이전',
      body: [
        '개인정보를 다른 회사에 팔거나 제공하지 않습니다(법령에 따른 요청 제외).',
        '서비스 운영을 위해 서버·데이터베이스를 Render(미국 오리건)에, 웹 화면을 Cloudflare에 맡겨 보관·처리합니다. 이 과정에서 위 정보가 미국 등 국외에 저장될 수 있습니다.',
        '채널 자동 분류에 쓰는 AI에는 채널의 공개 글만 보내며, 이용자 정보는 보내지 않습니다.',
      ],
    },
    {
      title: '5. 이용자의 권리',
      body: [
        '내 정보의 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다.',
        '요청과 문의: 텔레그램 @kplay33',
      ],
    },
    {
      title: '6. 시행일',
      body: ['2026년 11월 3일'],
    },
  ];
  return (
    <div className="min-h-[calc(100dvh-68px)] bg-nl-bg px-4 pt-3 pb-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-2 flex h-10 items-center gap-1 text-[14px] font-semibold text-nl-muted"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M15 5l-7 7 7 7" />
        </svg>
        뒤로
      </button>
      <h1 className="text-[22px] font-black text-nl-text">개인정보 처리방침</h1>
      <p className="mt-1 text-[13px] text-nl-muted">TellLink가 어떤 정보를 왜, 얼마나 보관하는지 알려 드려요.</p>
      <div className="mt-5 space-y-5">
        {sections.map((section) => (
          <section key={section.title} className="rounded-2xl bg-nl-card p-4 ring-1 ring-nl-line">
            <h2 className="text-[15px] font-bold text-nl-text">{section.title}</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-nl-text/90">
              {section.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
