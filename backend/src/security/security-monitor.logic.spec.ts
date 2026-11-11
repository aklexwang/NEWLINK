import { classifySample, maskIp } from './security-monitor.logic';

describe('maskIp', () => {
  it('IPv4 는 마지막 옥텟을 가린다', () => {
    expect(maskIp('203.0.113.45')).toBe('203.0.113.x');
    expect(maskIp('203.0.113.45:51000')).toBe('203.0.113.x');
  });
  it('IPv6 는 앞 두 그룹만', () => {
    expect(maskIp('2001:db8:1234:5678::1')).toBe('2001:db8:…');
  });
  it('빈 값은 -', () => {
    expect(maskIp('')).toBe('-');
    expect(maskIp(null)).toBe('-');
  });
});

describe('classifySample', () => {
  it('취약점 스캔 경로', () => {
    expect(classifySample('/.env')).toBe('scan');
    expect(classifySample('/wp-login.php')).toBe('scan');
    expect(classifySample('/phpmyadmin/index.php')).toBe('scan');
    expect(classifySample('/.git/config')).toBe('scan');
  });
  it('인젝션 흔적', () => {
    expect(classifySample("/api/x?id=1 UNION SELECT password FROM users")).toBe('injection');
    expect(classifySample('/api/x?q=1 or 1=1')).toBe('injection');
    expect(classifySample('/api/../../etc/passwd')).toBe('injection');
  });
  it('그 외는 scrape', () => {
    expect(classifySample('/api/channels')).toBe('scrape');
    expect(classifySample('/api/ranking')).toBe('scrape');
  });
});
