/**
 * 글자를 클립보드에 복사하고 성공 여부를 돌려준다.
 *
 * 순서가 중요하다: 먼저 임시 입력칸 + execCommand 로 "클릭한 그 순간"에 복사한다.
 * (클립보드 권한이 막힌 브라우저에서는 navigator.clipboard 가 거절되거나 한참 응답이 없는데,
 *  그걸 기다린 뒤에는 클릭 순간이 지나 execCommand 도 실패한다.)
 * 그게 안 될 때만 navigator.clipboard 를 쓴다.
 */
export async function copyText(text: string): Promise<boolean> {
  if (copyWithTextarea(text)) return true;
  try {
    if (!navigator.clipboard) return false;
    await Promise.race([
      navigator.clipboard.writeText(text),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('timeout')), 1500),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

function copyWithTextarea(text: string): boolean {
  const active = document.activeElement as HTMLElement | null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  let ok = false;
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  active?.focus?.();
  return ok;
}
