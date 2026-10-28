import { MigrationInterface, QueryRunner } from 'typeorm';

/** 게시글 날짜 색인: "최근 N일 글" 조회(홈 피드·통계·자동 발견)를 빠르게 */
export class AddChannelPostsPostedAtIndex1761520000000 implements MigrationInterface {
  name = 'AddChannelPostsPostedAtIndex1761520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "idx_channel_posts_posted_at" ON "channel_posts" ("posted_at")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_channel_posts_posted_at"',
    );
  }
}
