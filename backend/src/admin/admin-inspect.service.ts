import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import { Channel, LinkType } from '../channels/channel.entity';
import { ChannelsService } from '../channels/channels.service';
import { isInviteOnlyLink } from '../channels/telegram-username';
import { PUBLIC_INSPECT_GAP_MS } from '../stats/public-channel-inspect.logic';
import { createPublicTelegramFetcher } from '../stats/public-telegram-fetch.logic';
import { StatsJobService } from '../stats/stats-job.service';
import { describeMemberPageVisibility } from '../stats/public-list-visibility.logic';
import { StatsRun } from '../stats/stats-run.entity';
import { shouldBlockAdminCollect } from './admin-collect.logic';
import {
  AdminInspectJob,
  type AdminInspectJobStatus,
} from './admin-inspect-job.entity';
import { AdminInspectItem } from './admin-inspect-item.entity';
import {
  ADMIN_INSPECT_BUSY_COLLECT,
  ADMIN_INSPECT_BUSY_JOB,
  assertRegisterManySize,
  classifyAdminInspectPage,
  interruptRunningInspectJobs,
  inspectItemResultCaption,
  inspectJobTtlCutoff,
  parseAdminInspectLines,
} from './admin-inspect.logic';

@Injectable()
export class AdminInspectService implements OnModuleInit {
  private readonly logger = new Logger(AdminInspectService.name);
  private workerRunning = false;
  private readonly publicFetch = createPublicTelegramFetcher();

  constructor(
    private readonly statsJob: StatsJobService,
    private readonly channelsService: ChannelsService,
    private readonly categoryAi: CategoryAiService,
    @InjectRepository(AdminInspectJob)
    private readonly jobRepository: Repository<AdminInspectJob>,
    @InjectRepository(AdminInspectItem)
    private readonly itemRepository: Repository<AdminInspectItem>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(StatsRun)
    private readonly runRepository: Repository<StatsRun>,
  ) {}

  async onModuleInit() {
    const now = new Date();
    const running = await this.jobRepository.find({
      where: { status: 'running' },
    });
    const interrupted = interruptRunningInspectJobs(running, now);
    for (const job of interrupted) {
      await this.jobRepository.update(job.id, {
        status: job.status,
        endedReason: job.endedReason,
        finishedAt: job.finishedAt,
      });
    }
    if (interrupted.length > 0) {
      this.logger.warn(
        `끝나지 않은 미리보기 ${interrupted.length}건을 interrupted 로 표시했습니다.`,
      );
    }
    await this.pruneOldJobs(now);
  }

  async startInspect(text: string, category?: string) {
    await this.assertCanStart();
    const lines = parseAdminInspectLines(text);
    if (lines.length === 0) {
      throw new BadRequestException('확인할 링크를 붙여 넣어 주세요.');
    }
    const now = new Date();
    await this.pruneOldJobs(now);
    const jobId = randomUUID();
    await this.jobRepository.insert({
      id: jobId,
      status: 'running',
      processed: lines.filter((line) => line.result).length,
      total: lines.length,
      endedReason: null,
      category: category?.trim() || null,
      createdAt: now,
      startedAt: now,
      finishedAt: null,
    });
    await this.itemRepository.insert(
      lines.map((line, index) => ({
        id: randomUUID(),
        jobId,
        lineNo: index + 1,
        rawInput: line.rawInput,
        link: line.link,
        username: line.username,
        result: line.result,
        title: null,
        memberCount: null,
        linkType: null,
        language: null,
        registeredChannelId: null,
      })),
    );
    void this.runJob(jobId);
    return { jobId };
  }

  async resumeInspect(jobId: string) {
    await this.assertCanStart();
    const job = await this.jobRepository.findOneBy({ id: jobId });
    if (!job) throw new NotFoundException('확인 작업을 찾을 수 없습니다.');
    if (job.status !== 'interrupted') {
      throw new BadRequestException('중단된 작업만 이어서 확인할 수 있습니다.');
    }
    const pending = await this.itemRepository.count({
      where: { jobId, result: IsNull() },
    });
    if (pending === 0) {
      throw new BadRequestException('이어서 확인할 줄이 없습니다.');
    }
    const now = new Date();
    await this.jobRepository.update(jobId, {
      status: 'running',
      endedReason: null,
      startedAt: job.startedAt ?? now,
      finishedAt: null,
    });
    void this.runJob(jobId);
    return { jobId };
  }

  async getJob(jobId: string) {
    const job = await this.jobRepository.findOneBy({ id: jobId });
    if (!job) throw new NotFoundException('확인 작업을 찾을 수 없습니다.');
    const items = await this.itemRepository.find({
      where: { jobId },
      order: { lineNo: 'ASC' },
    });
    return this.toJobView(job, items);
  }

  async getLatest() {
    const job = await this.jobRepository.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    if (!job[0]) return null;
    return this.getJob(job[0].id);
  }

  async registerMany(ids: string[], category?: string) {
    let unique: string[];
    try {
      unique = assertRegisterManySize(ids);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '등록할 수 없습니다.',
      );
    }
    const results: Array<{ id: string; ok: boolean; message?: string }> = [];
    for (let i = 0; i < unique.length; i += 1) {
      const id = unique[i];
      try {
        await this.registerOne(id, category);
        results.push({ id, ok: true });
      } catch (error) {
        results.push({
          id,
          ok: false,
          message:
            error instanceof Error ? error.message : '등록에 실패했습니다.',
        });
      }
      if (i < unique.length - 1) {
        await sleep(PUBLIC_INSPECT_GAP_MS);
      }
    }
    return { results };
  }

  private async registerOne(itemId: string, category?: string) {
    const item = await this.itemRepository.findOneBy({ id: itemId });
    if (!item) throw new Error('항목을 찾을 수 없습니다.');
    if (item.registeredChannelId) return;
    if (item.result !== 'ok' || !item.link) {
      throw new Error('정상 항목만 등록할 수 있습니다.');
    }
    const existing = await this.findExisting(item.link, item.username);
    if (existing) {
      await this.itemRepository.update(item.id, {
        result: 'already_registered',
        registeredChannelId: existing.id,
      });
      throw new Error('이미 등록된 채널입니다.');
    }
    const linkType =
      item.linkType === 'group' ? LinkType.GROUP : LinkType.CHANNEL;
    let nextCategory = category?.trim() || '';
    if (!nextCategory) {
      const classified = await this.categoryAi.classify({
        title: item.title ?? item.username ?? item.link,
        allowedCategories: this.categoryAi.defaultCategoryNames(),
      });
      nextCategory = classified.category;
    }
    const saved = await this.channelsService.createByAdmin({
      title: (item.title ?? item.username ?? item.link).slice(0, 255),
      link: item.link,
      linkType,
      category: nextCategory,
      description: item.title ?? undefined,
    });
    await this.itemRepository.update(item.id, {
      registeredChannelId: saved.id,
    });
  }

  private async runJob(jobId: string) {
    this.workerRunning = true;
    try {
      const pending = await this.itemRepository.find({
        where: { jobId, result: IsNull() },
        order: { lineNo: 'ASC' },
      });
      for (const item of pending) {
        await this.inspectItem(item);
        const leftover = await this.itemRepository.count({
          where: { jobId, result: IsNull() },
        });
        const job = await this.jobRepository.findOneBy({ id: jobId });
        if (job) {
          await this.jobRepository.update(jobId, {
            processed: job.total - leftover,
          });
        }
      }
      const leftover = await this.itemRepository.count({
        where: { jobId, result: IsNull() },
      });
      await this.jobRepository.update(jobId, {
        status: leftover > 0 ? 'interrupted' : 'completed',
        endedReason: leftover > 0 ? 'interrupted' : 'completed',
        finishedAt: new Date(),
        processed: await this.countedProcessed(jobId),
      });
    } catch (error) {
      this.logger.warn(
        `미리보기 실패: ${error instanceof Error ? error.message : error}`,
      );
      await this.jobRepository.update(jobId, {
        status: 'interrupted',
        endedReason: 'interrupted',
        finishedAt: new Date(),
      });
    } finally {
      this.workerRunning = false;
    }
  }

  private async inspectItem(item: AdminInspectItem): Promise<boolean> {
    if (!item.link) {
      await this.itemRepository.update(item.id, { result: 'invalid_format' });
      return false;
    }
    const existing = await this.findExisting(item.link, item.username);
    if (existing) {
      await this.itemRepository.update(item.id, {
        result: 'already_registered',
        title: existing.title,
        memberCount: existing.memberCount,
        linkType: existing.linkType,
        registeredChannelId: existing.id,
      });
      return false;
    }
    const page = await this.publicFetch.fetchHtml(item.link);
    const classified = classifyAdminInspectPage({
      html: page.html,
      status: page.status,
      isInvite: isInviteOnlyLink(item.link),
      finalUrl: page.finalUrl,
    });
    await this.itemRepository.update(item.id, {
      result: classified.result,
      title: classified.title,
      memberCount: classified.memberCount,
      linkType: classified.linkType,
      language: classified.language,
    });
    return true;
  }

  private async findExisting(link: string, username: string | null) {
    const byLink = await this.channelsService.findByLink(link);
    if (byLink) return byLink;
    if (!username) return null;
    return this.channelRepository.findOne({
      where: { username: username.toLowerCase() },
    });
  }

  private async assertCanStart() {
    if (this.workerRunning) {
      throw new ConflictException(ADMIN_INSPECT_BUSY_JOB);
    }
    const running = await this.jobRepository.count({
      where: { status: 'running' },
    });
    if (running > 0) {
      throw new ConflictException(ADMIN_INSPECT_BUSY_JOB);
    }
    const open = await this.runRepository.find({
      where: { finishedAt: IsNull() },
      select: ['id', 'startedAt', 'finishedAt'],
    });
    if (shouldBlockAdminCollect(this.statsJob.isRunning(), open)) {
      throw new ConflictException(ADMIN_INSPECT_BUSY_COLLECT);
    }
  }

  private async countedProcessed(jobId: string): Promise<number> {
    const job = await this.jobRepository.findOneBy({ id: jobId });
    const pending = await this.itemRepository.count({
      where: { jobId, result: IsNull() },
    });
    return Math.max(0, (job?.total ?? 0) - pending);
  }

  private async pruneOldJobs(now: Date) {
    const cutoff = inspectJobTtlCutoff(now);
    await this.jobRepository.delete({
      createdAt: LessThan(cutoff),
      status: 'completed' as AdminInspectJobStatus,
    });
    await this.jobRepository.delete({
      createdAt: LessThan(cutoff),
      status: 'interrupted' as AdminInspectJobStatus,
    });
  }

  private async toJobView(job: AdminInspectJob, items: AdminInspectItem[]) {
    const ids = [
      ...new Set(
        items
          .map((item) => item.registeredChannelId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const channels =
      ids.length > 0
        ? await this.channelRepository.find({ where: { id: In(ids) } })
        : [];
    const byId = new Map(channels.map((channel) => [channel.id, channel]));
    return {
      id: job.id,
      status: job.status,
      processed: job.processed,
      total: job.total,
      endedReason: job.endedReason,
      category: job.category,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      items: items.map((item) => {
        const channel = item.registeredChannelId
          ? byId.get(item.registeredChannelId)
          : undefined;
        const visibility = channel
          ? describeMemberPageVisibility(channel)
          : null;
        const registeredThisJob =
          Boolean(item.registeredChannelId) && item.result === 'ok';
        return {
          id: item.id,
          lineNo: item.lineNo,
          rawInput: item.rawInput,
          link: item.link,
          username: item.username,
          result: item.result,
          title: item.title,
          memberCount: item.memberCount,
          linkType: item.linkType,
          language: item.language,
          registeredChannelId: item.registeredChannelId,
          registeredThisJob,
          memberPageVisible: visibility?.visible ?? null,
          memberPageReason:
            visibility && !visibility.visible ? visibility.reason : null,
          resultCaption: inspectItemResultCaption({
            result: item.result,
            registeredThisJob,
            memberVisible: visibility?.visible ?? null,
            memberReason:
              visibility && !visibility.visible ? visibility.reason : null,
          }),
        };
      }),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
