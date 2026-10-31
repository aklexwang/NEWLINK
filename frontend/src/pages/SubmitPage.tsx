import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { submitChannel } from '../api/channels';
import { getRewardPolicy } from '../api/rewards';
import { SubmitWalletPicker, type WalletMethod } from '../components/SubmitWalletPicker';
import { useTonWalletLink } from '../hooks/useTonWalletLink';
import { useAuth } from '../providers/AuthProvider';
import { notifyUser, useTelegram } from '../hooks/useTelegram';
import type { LinkType } from '../types/channel';

/** 우리 파란색 (텔레그램 버튼 색) */
const BLUE = '#229af0';

/** @아이디, t.me/아이디 처럼 적어도 https://t.me/… 로 맞춘다 */
function normalizeSubmitLink(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  if (/^@[A-Za-z][A-Za-z0-9_]{3,31}$/.test(v)) return `https://t.me/${v.slice(1)}`;
  if (/^(t\.me|telegram\.me)\//i.test(v)) return `https://${v}`;
  if (/^http:\/\//i.test(v)) return v.replace(/^http:/i, 'https:');
  return v;
}

export function SubmitPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { webApp, isLocalBrowser } = useTelegram();
  const { user, status: authStatus } = useAuth();
  const { isLinked, connect, savedAddress } = useTonWalletLink({ autoSync: false });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [walletMethod, setWalletMethod] = useState<WalletMethod>('telegram');
  const [rewardsEnabled, setRewardsEnabled] = useState(true);
  const [requireWalletPolicy, setRequireWalletPolicy] = useState(true);
  /** 보상 정책을 받기 전에는 지갑 상자를 그리지 않는다 (보상 꺼짐일 때 잠깐 보였다 사라지는 문제) */
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const pendingSubmitRef = useRef(false);
  // 서버가 링크 종류를 판별하지 못했을 때만 회원에게 선택을 받는다.
  const [needLinkType, setNeedLinkType] = useState(false);
  const [form, setForm] = useState({
    linkType: 'channel' as LinkType,
    title: '',
    link: '',
    description: '',
  });

  const isLoggedIn = authStatus === 'authenticated' && Boolean(user);
  const hasWallet = Boolean((user?.isRegistered && user.tonWalletAddress) || isLinked || savedAddress);
  const requireWallet =
    requireWalletPolicy ||
    Boolean((location.state as { requireWallet?: boolean } | null)?.requireWallet);

  const notify = useCallback(
    (message: string) => notifyUser(webApp, isLocalBrowser, message),
    [webApp, isLocalBrowser],
  );

  const doSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await submitChannel({
        linkType: needLinkType ? form.linkType : undefined,
        title: form.title.trim(),
        link: normalizeSubmitLink(form.link),
        description: form.description.trim(),
      });
      notify('제보가 접수되었습니다. 관리자 승인 후 노출됩니다.');
      navigate('/');
    } catch (error) {
      if (
        isAxiosError(error) &&
        error.response?.status === 400 &&
        error.response.data?.code === 'LINK_TYPE_REQUIRED'
      ) {
        setNeedLinkType(true);
        notify('링크 종류를 자동으로 확인하지 못했습니다. 채널/그룹을 선택한 뒤 다시 제보해 주세요.');
      } else if (isAxiosError(error) && error.response?.status === 409) {
        const message = error.response.data?.message;
        notify(
          typeof message === 'string' ? message : '이미 등록된 채널입니다.',
        );
      } else {
        notify('제보 접수에 실패했습니다.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [form, needLinkType, notify, navigate]);

  useEffect(() => {
    void getRewardPolicy()
      .then((policy) => {
        setRewardsEnabled(policy.rewardsEnabled);
        setRequireWalletPolicy(policy.requireWallet);
      })
      .catch(() => undefined)
      .finally(() => setPolicyLoaded(true));
  }, []);

  useEffect(() => {
    if (requireWalletPolicy && isLoggedIn && !hasWallet) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [requireWalletPolicy, isLoggedIn, hasWallet, navigate, location.pathname]);

  useEffect(() => {
    if (!pendingSubmitRef.current || !hasWallet) return;
    pendingSubmitRef.current = false;
    void doSubmit();
  }, [hasWallet, doSubmit]);

  const handleWalletLinked = (address: string, method: WalletMethod) => {
    setWalletMethod(method);
    notify(
      method === 'telegram'
        ? '텔레그램 Wallet이 연결되었습니다. 보상은 이 주소로만 지급됩니다.'
        : '외부 지갑이 등록되었습니다. 보상은 이 주소로만 지급됩니다.',
    );
    if (pendingSubmitRef.current && address) {
      pendingSubmitRef.current = false;
      void doSubmit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isLoggedIn) {
      notify('제보하기는 로그인후 가능합니다');
      navigate('/my');
      return;
    }

    if (requireWallet && !hasWallet) {
      if (walletMethod === 'telegram') {
        pendingSubmitRef.current = true;
        try {
          await connect();
        } catch {
          pendingSubmitRef.current = false;
          notify('텔레그램 Wallet을 연결하거나 외부 지갑을 등록해 주세요.');
        }
        return;
      }
      notify('외부 지갑 주소를 등록해 주세요.');
      return;
    }

    await doSubmit();
  };

  // 텔레그램 미니앱에서는 텔레그램 클립보드, 그 밖에서는 브라우저 클립보드에서 링크를 붙여 넣는다
  const pasteLink = async () => {
    const apply = (text: string | null | undefined) => {
      const value = (text ?? '').trim();
      if (!value) {
        notify('복사한 링크가 없어요. 링크를 길게 눌러 붙여 넣어 주세요.');
        return;
      }
      setForm((prev) => ({ ...prev, link: normalizeSubmitLink(value) }));
    };
    try {
      const tg = webApp as unknown as { readTextFromClipboard?: (cb: (text: string | null) => void) => void };
      if (!isLocalBrowser && typeof tg.readTextFromClipboard === 'function') {
        tg.readTextFromClipboard((text) => apply(text));
        return;
      }
      apply(await navigator.clipboard.readText());
    } catch {
      notify('붙여넣기를 할 수 없어요. 링크를 길게 눌러 붙여 넣어 주세요.');
    }
  };

  const linkReady = /t(elegram)?\.me\//i.test(normalizeSubmitLink(form.link));
  const canSubmit = isLoggedIn && linkReady && form.title.trim() !== '' && form.description.trim() !== '';
  const fieldClass =
    'w-full rounded-2xl bg-nl-card px-4 py-3.5 text-[15px] text-nl-text ring-1 ring-nl-line outline-none placeholder:text-nl-muted focus:ring-2 focus:ring-[#229af0]';

  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col bg-nl-bg pb-6">
      <header className="px-4 pt-4 pb-1">
        <h1 className="text-[22px] font-black text-nl-text">제보하기</h1>
        <p className="mt-1 text-[13px] text-nl-muted">
          {policyLoaded && rewardsEnabled
            ? '좋은 채널·그룹을 알려 주세요. 승인되면 보상을 받아요'
            : '좋은 채널·그룹을 알려 주세요. 확인 후 TellLink에 노출돼요'}
        </p>
      </header>

      {/* 진행 순서 한눈에 */}
      <ol className="mx-4 mt-3 grid grid-cols-3 gap-2 text-center">
        {['링크 붙여넣기', '관리자 확인', policyLoaded && rewardsEnabled ? '노출 · 보상' : 'TellLink 노출'].map((label, i) => (
          <li key={label} className="rounded-xl bg-nl-card px-2 py-2.5 ring-1 ring-nl-line">
            <span
              className="mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-black text-white"
              style={{ background: BLUE }}
            >
              {i + 1}
            </span>
            <span className="mt-1.5 block text-[12px] font-semibold text-nl-text">{label}</span>
          </li>
        ))}
      </ol>

      {!isLoggedIn && authStatus !== 'loading' && (
        <div className="mx-4 mt-4 rounded-2xl bg-nl-card p-4 ring-1 ring-nl-line">
          <p className="text-[15px] font-bold text-nl-text">로그인이 필요해요</p>
          <p className="mt-1 text-[13px] text-nl-muted">제보는 텔레그램 로그인 후 할 수 있어요.</p>
          <Link
            to="/my"
            className="mt-3 inline-flex rounded-xl px-4 py-2.5 text-[14px] font-bold text-white"
            style={{ background: BLUE }}
          >
            로그인하러 가기
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-4 pt-5">
        {isLoggedIn && policyLoaded && (requireWallet || rewardsEnabled) && (
          <SubmitWalletPicker onLinked={handleWalletLinked} onNotify={notify} />
        )}

        <div>
          <label htmlFor="submit-link" className="mb-2 flex items-baseline justify-between">
            <span className="text-[14px] font-bold text-nl-text">링크</span>
            <span className="text-[12px] text-nl-muted">t.me 주소 또는 @아이디</span>
          </label>
          <div className="relative">
            <input
              id="submit-link"
              required
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              onBlur={() => setForm((prev) => ({ ...prev, link: normalizeSubmitLink(prev.link) }))}
              placeholder="https://t.me/채널아이디"
              maxLength={512}
              className={`${fieldClass} pr-[92px]`}
            />
            {form.link ? (
              <button
                type="button"
                onClick={() => setForm({ ...form, link: '' })}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-xl px-3 py-2 text-[13px] font-semibold text-nl-muted"
              >
                지우기
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void pasteLink()}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-xl px-3 py-2 text-[13px] font-bold text-white"
                style={{ background: BLUE }}
              >
                붙여넣기
              </button>
            )}
          </div>
          {form.link && !linkReady && (
            <p className="mt-1.5 text-[12px] text-amber-400">t.me 주소만 제보할 수 있어요. 예: https://t.me/telllink</p>
          )}
        </div>

        {needLinkType && (
          <div>
            <p className="mb-2 text-[14px] font-bold text-nl-text">종류</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'channel', label: '채널' },
                { value: 'group', label: '그룹' },
              ] as const).map((option) => {
                const active = form.linkType === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm({ ...form, linkType: option.value })}
                    className={`rounded-xl py-3 text-[14px] font-bold ring-1 ${
                      active ? 'text-white ring-transparent' : 'bg-nl-card text-nl-muted ring-nl-line'
                    }`}
                    style={active ? { background: BLUE } : undefined}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[12px] text-nl-muted">링크 종류를 자동으로 확인하지 못했어요. 직접 골라 주세요.</p>
          </div>
        )}

        <div>
          <label htmlFor="submit-title" className="mb-2 block text-[14px] font-bold text-nl-text">
            이름
          </label>
          <input
            id="submit-title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="채널·그룹 이름"
            maxLength={255}
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="submit-desc" className="mb-2 flex items-baseline justify-between">
            <span className="text-[14px] font-bold text-nl-text">소개</span>
            <span className="text-[12px] text-nl-muted">{form.description.length.toLocaleString('ko-KR')}자</span>
          </label>
          <textarea
            id="submit-desc"
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="어떤 내용을 올리는 곳인지 한두 줄로 적어 주세요"
            rows={4}
            className={`${fieldClass} resize-none leading-relaxed`}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !canSubmit}
          className="mt-1 w-full rounded-2xl py-4 text-[16px] font-bold text-white transition-opacity disabled:opacity-40"
          style={{ background: BLUE }}
        >
          {isSubmitting ? '접수 중…' : '제보하기'}
        </button>
        <p className="-mt-2 text-center text-[12px] text-nl-muted">이미 등록된 방은 접수되지 않아요.</p>
      </form>
    </div>
  );
}
