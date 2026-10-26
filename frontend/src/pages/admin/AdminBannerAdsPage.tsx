import { useCallback, useEffect, useState } from 'react';
import {
  BANNER_ROTATE_CHOICES,
  BANNER_SIZE,
  createAdminBanner,
  deleteAdminBanner,
  getAdminBanners,
  setBannerRotateSeconds,
  updateAdminBanner,
  type AdminBanner,
  type BannerForm,
} from '../../api/ads';
import { AdPaymentChips, AdPaymentFields } from '../../components/admin/AdPayment';
import { AdminDatePicker } from '../../components/admin/AdminDatePicker';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { resolveMediaUrl } from '../../utils/mediaUrl';

function kstDateInput(iso: string | null, end: boolean): string {
  if (!iso) return '';
  const t = new Date(iso).getTime() - (end ? 1 : 0);
  const d = new Date(t + 9 * 3600_000);
  return d.toISOString().slice(0, 10);
}

const inputClass =
  'mt-1.5 h-11 w-full rounded-xl bg-background px-3.5 text-[15px] text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50';

/** 배너 하나 추가·수정 칸 */
function BannerEditor({
  banner,
  onDone,
  onCancel,
}: {
  banner?: AdminBanner;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(banner?.title ?? '');
  const [link, setLink] = useState(banner?.link ?? '');
  const [startsOn, setStartsOn] = useState(kstDateInput(banner?.startsAt ?? null, false));
  const [endsOn, setEndsOn] = useState(kstDateInput(banner?.endsAt ?? null, true));
  const [sortOrder, setSortOrder] = useState(String(banner?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(banner?.isActive ?? true);
  const [paidUsdt, setPaidUsdt] = useState(banner?.paidUsdt != null ? String(banner.paidUsdt) : '');
  const [paidOn, setPaidOn] = useState(banner?.paidOn ?? '');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(
    banner ? resolveMediaUrl(banner.imageUrl) : null,
  );
  const [sizeNote, setSizeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const pick = (file: File | null) => {
    setImage(file);
    setSizeNote('');
    if (!file) return;
    if (file.size > BANNER_SIZE.maxMb * 1024 * 1024) {
      setMessage('이미지는 1MB 이하로 올려 주세요.');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      setSizeNote(
        Math.abs(ratio - 3) > 0.15
          ? `지금 ${img.width}×${img.height} — 3:1 비율(${BANNER_SIZE.width}×${BANNER_SIZE.height})이 아니라 위아래가 잘릴 수 있어요`
          : `${img.width}×${img.height} ✓`,
      );
    };
    img.src = url;
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const form: BannerForm = {
        title: title.trim(),
        link: link.trim(),
        startsOn,
        endsOn,
        sortOrder: Number(sortOrder) || 0,
        isActive,
        paidUsdt,
        paidOn,
        image,
      };
      if (banner) await updateAdminBanner(banner.id, form);
      else await createAdminBanner(form);
      onDone();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
      <h3 className="text-base font-bold text-foreground">{banner ? '배너 수정' : '새 배너'}</h3>
      <div>
        <p className="text-sm font-medium text-subtle">
          배너 이미지 · {BANNER_SIZE.width}×{BANNER_SIZE.height}px (3:1), JPG·PNG·WebP, {BANNER_SIZE.maxMb}MB 이하
        </p>
        <label className="mt-2 block max-w-[600px] cursor-pointer overflow-hidden rounded-xl bg-muted ring-1 ring-border">
          {preview ? (
            <img src={preview} alt="" className="block aspect-[3/1] w-full object-cover" />
          ) : (
            <div className="flex aspect-[3/1] w-full items-center justify-center text-sm text-muted-foreground">
              눌러서 이미지 선택
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
        </label>
        {sizeNote && <p className="mt-1.5 text-xs text-subtle">{sizeNote}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-subtle">
          광고 이름 (관리용)
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="예: AXPAY 11월" />
        </label>
        <label className="block text-sm font-medium text-subtle">
          누르면 이동할 텔레그램 링크
          <input value={link} onChange={(e) => setLink(e.target.value)} className={inputClass} placeholder="https://t.me/아이디 또는 초대 링크" />
        </label>
        <div className="block text-sm font-medium text-subtle">
          시작일 (비우면 바로)
          <AdminDatePicker className="mt-1.5" value={startsOn} onChange={setStartsOn} placeholder="바로 시작" />
        </div>
        <div className="block text-sm font-medium text-subtle">
          종료일 (이 날까지 노출, 비우면 계속)
          <AdminDatePicker
            className="mt-1.5"
            value={endsOn}
            onChange={setEndsOn}
            placeholder="계속 노출"
            min={startsOn || undefined}
            quickBase={startsOn || undefined}
          />
        </div>
        <AdPaymentFields usdt={paidUsdt} onUsdt={setPaidUsdt} paidOn={paidOn} onPaidOn={setPaidOn} />
        <label className="block text-sm font-medium text-subtle">
          순서 (작을수록 먼저)
          <input type="number" min={0} max={999} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={inputClass} />
        </label>
        <label className="flex items-center gap-2.5 self-end pb-3 text-sm text-foreground">
          <input type="checkbox" className="h-5 w-5" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          노출 켜기
        </label>
      </div>
      {message && <p className="text-sm text-destructive">{message}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={saving || (!banner && !image)} onClick={() => void save()} className="h-11 rounded-xl bg-primary px-6 text-[15px] font-semibold text-white disabled:opacity-50">
          {saving ? '저장 중…' : banner ? '수정 저장' : '배너 추가'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-11 rounded-xl bg-muted px-5 text-[15px] font-semibold text-foreground">
            취소
          </button>
        )}
      </div>
    </div>
  );
}

/** 어드민 > 광고 관리: 홈 배너 광고 */
export function AdminBannerAdsPage() {
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [rotate, setRotate] = useState(3);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getAdminBanners();
      setBanners(data.banners);
      setRotate(data.rotateSeconds);
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '배너를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRotate = async (seconds: number) => {
    try {
      setRotate(await setBannerRotateSeconds(seconds));
      setMessage(`넘김 간격을 ${seconds}초로 바꿨어요.`);
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '간격을 바꾸지 못했습니다.'));
    }
  };

  const remove = async (banner: AdminBanner) => {
    if (!window.confirm(`"${banner.title}" 배너를 삭제할까요?`)) return;
    await deleteAdminBanner(banner.id);
    await load();
  };

  const liveCount = banners.filter((b) => b.live).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          회원 홈에 보이는 배너 {liveCount}개 · 전체 {banners.length}개
        </p>
        <button type="button" onClick={() => setAdding((v) => !v)} className="h-11 rounded-xl bg-primary px-5 text-[15px] font-semibold text-white">
          {adding ? '닫기' : '+ 배너 추가'}
        </button>
      </div>
      {message && <p className="text-sm text-foreground">{message}</p>}

      <div className="rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
        <p className="text-base font-bold text-foreground">넘김 간격</p>
        <p className="mt-1 text-sm text-subtle">배너가 2개 이상이면 이 간격마다 옆으로 넘어가요.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BANNER_ROTATE_CHOICES.map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => void changeRotate(seconds)}
              className={`h-10 min-w-[64px] rounded-xl px-4 text-[15px] font-semibold ${
                rotate === seconds ? 'bg-primary text-white' : 'bg-muted text-subtle hover:bg-muted/70'
              }`}
            >
              {seconds}초
            </button>
          ))}
        </div>
      </div>

      {adding && (
        <BannerEditor
          onDone={() => {
            setAdding(false);
            void load();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : banners.length === 0 ? (
        <p className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-[var(--hz-shadow)]">
          아직 배너가 없어요. [+ 배너 추가]로 넣어 주세요.
        </p>
      ) : (
        <div className="space-y-4">
          {banners.map((banner) =>
            editingId === banner.id ? (
              <BannerEditor
                key={banner.id}
                banner={banner}
                onDone={() => {
                  setEditingId(null);
                  void load();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={banner.id} className="flex flex-col overflow-hidden rounded-2xl bg-card shadow-[var(--hz-shadow)] sm:flex-row sm:items-center">
                <img src={resolveMediaUrl(banner.imageUrl)} alt={banner.title} className="block aspect-[3/1] w-full shrink-0 object-cover sm:w-[360px]" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-base font-bold text-foreground">
                      {banner.title}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          banner.live ? 'bg-green-100 text-green-800' : 'bg-muted text-subtle'
                        }`}
                      >
                        {banner.live ? '노출 중' : banner.isActive ? '기간 밖' : '꺼짐'}
                      </span>
                    </p>
                    <p className="mt-1 truncate text-sm text-primary">{banner.link}</p>
                    <p className="mt-1.5">
                      <AdPaymentChips
                        paidUsdt={banner.paidUsdt}
                        paidOn={banner.paidOn}
                        daysLeft={banner.daysLeft}
                        live={banner.isActive}
                      />
                    </p>
                    <p className="mt-1 text-sm text-subtle">
                      순서 {banner.sortOrder} · 클릭 {banner.clicks.toLocaleString()}회 ·{' '}
                      {kstDateInput(banner.startsAt, false) || '처음부터'} ~ {kstDateInput(banner.endsAt, true) || '계속'}
                    </p>
                  </div>
                  <button type="button" onClick={() => setEditingId(banner.id)} className="h-10 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground">
                    수정
                  </button>
                  <button type="button" onClick={() => void remove(banner)} className="h-10 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10">
                    삭제
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
