/** Convert TON amount (human) to nanotons string for TonConnect messages. */
export function toNanoTon(amount: string | number): string {
  const value = typeof amount === 'number' ? amount : Number.parseFloat(amount);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Invalid TON amount');
  }
  const [whole = '0', frac = ''] = value.toFixed(9).split('.');
  const nanotons = `${whole}${frac.padEnd(9, '0')}`.replace(/^0+(?=\d)/, '');
  return nanotons || '0';
}

export function shortenTonAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
