import { DataSource } from 'typeorm';
import { AddAdBanners1761460000000 } from './1761460000000-AddAdBanners';

describe('AddAdBanners1761460000000', () => {
  it('up/down/up', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();
    try {
      const m = new AddAdBanners1761460000000();
      await m.up(runner);
      await m.up(runner);
      await dataSource.query(
        "INSERT INTO ad_banners (id, title, link, image_mime, image_data, image_version) VALUES ('a', 't', 'https://t.me/x', 'image/png', x'00', 'v1')",
      );
      const [row] = await dataSource.query(
        'SELECT is_active, clicks, sort_order FROM ad_banners',
      );
      expect(row.clicks).toBe(0);
      expect(Boolean(row.is_active)).toBe(true);
      await m.down(runner);
      expect(await runner.hasTable('ad_banners')).toBe(false);
      expect(await runner.hasTable('app_settings')).toBe(false);
      await m.up(runner);
      expect(await runner.hasTable('ad_banners')).toBe(true);
    } finally {
      await runner.release();
      await dataSource.destroy();
    }
  });
});
