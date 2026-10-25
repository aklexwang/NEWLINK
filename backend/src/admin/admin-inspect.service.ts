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
import {
  excerptsFromPreviewPosts,
  PUBLIC_INSPECT_GAP_MS,
} from '../stats/public-channel-inspect.logic';
import { parseTelegramChannelHtml } from '../stats/telegram-preview-html';
import { createPublicTelegramFetcher } from '../stats/public-telegram-fetch.logic';
import { StatsJobService } from '../stats/stats-job.service';
import { describeMemberPageVisibility } from '../stats/public-list-visibility.logic';
import { StatsRun } from '../stats/stats-run.entity';
import { shouldBlockAdminCollect } from './admin-collect.logic';
import {
  AdminInspectJob,
  type AdminInspectJobStatus,
} from './admin-inspect-job.entity';
import {
  AdminInspectItem,
  type AdminInspectItemResult,
} from './admin-inspect-item.entity';
import {
  ADMIN_INSPECT_BUSY_COLLECT,
  ADMIN_INSPECT_BUSY_JOB,
  ADMIN_INSPECT_REGISTER_BLOCKED,
  applyMissingTitleResult,
  assertRegisterManySize,
  classifyAdminInspectPage,
  interruptRunningInspectJobs,
  inspectItemResultCaption,
  inspectJobTtlCutoff,
  parseAdminInspectLines,
  parseOneInspectLine,
  suggestInspectCategory,
  toChannelLanguage,
  type AdminInspectPageClassified,
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

  /** 단건. job 없이 대량과 같은 공개 페이지 검사를 바로 돌려준다. */
  async inspectOne(raw: string) {
    const parsed = parseOneInspectLine(raw);
    if (parsed.result === 'invalid_format' || !parsed.link) {
      return this.toInspectOneView({
        link: parsed.link,
        result: 'invalid_format',
        title: null,
        description: null,
        avatarUrl: null,
        memberCount: null,
        linkType: null,
        language: null,
        existing: null,
      });
    }
    const existing = await this.findExisting(parsed.link);
    if (existing) {
      return this.toInspectOneView({
        link: parsed.link,
        result: 'already_registered',
        title: existing.title,
        description: existing.description,
        avatarUrl: existing.avatarUrl,
        memberCount: existing.memberCount,
        linkType:
          existing.linkType === LinkType.GROUP ? 'group' : 'channel',
        language: existing.language ?? null,
        existing,
      });
    }
    const classified = applyMissingTitleResult(
      await this.fetchAndClassify(parsed.link, parsed.username),
    );
    return this.toInspectOneView({
      link: parsed.link,
      result: classified.result,
      title: classified.title,
      description: classified.description,
      avatarUrl: classified.avatarUrl,
      memberCount: classified.memberCount,
      linkType: classified.linkType,
      language: classified.language,
      existing: null,
    });
  }

  async registerInspected(data: {
    title: string;
    link: string;
    linkType?: LinkType;
    category: string;
    description?: string;
    isPromoted?: boolean;
    /** 거절된 같은 링크 행을 다시 활성화할지(확인창에서 승인한 경우) */
    reactivateRejected?: boolean;
  }) {
    const viewed = await this.inspectOne(data.link);
    if (viewed.alreadyRegistered) {
      if (viewed.existingStatus !== 'rejected') {
        throw new ConflictException('이미 등록된 채널입니다.');
      }
      // 거절된 행만 있으면 새로 만들지 않는다. 확인 전이면 createByAdmin 이 확인을 요청한다
      return this.channelsService.createByAdmin(
        {
          title: (data.title.trim() || viewed.title).slice(0, 255),
          link: viewed.link || data.link,
          linkType:
            viewed.linkType === 'group'
              ? LinkType.GROUP
              : (data.linkType ?? LinkType.CHANNEL),
          category: data.category,
          description:
            data.description?.trim() || viewed.description || viewed.title,
          isPromoted: data.isPromoted,
        },
        { reactivateRejected: data.reactivateRejected === true },
      );
    }
    if (
      !viewed.link ||
      !viewed.title?.trim() ||
      ADMIN_INSPECT_REGISTER_BLOCKED.has(viewed.result)
    ) {
      throw new BadRequestException(
        '이 링크로 방을 찾지 못했습니다. 링크(대소문자 포함)를 다시 확인하세요',
      );
    }
    const linkType =
      viewed.linkType === 'group'
        ? LinkType.GROUP
        : viewed.linkType === 'channel'
          ? LinkType.CHANNEL
          : data.linkType;
    if (linkType !== LinkType.CHANNEL && linkType !== LinkType.GROUP) {
      throw new BadRequestException('채널/그룹을 선택해 주세요.');
    }
    return this.channelsService.createByAdmin({
      title: (data.title.trim() || viewed.title).slice(0, 255),
      link: viewed.link,
      linkType,
      category: data.category,
      description: data.description?.trim() || viewed.description || viewed.title,
      isPromoted: data.isPromoted,
      // 검사로 판별한 언어를 그대로 저장한다
      language: toChannelLanguage(viewed.language),
    });
  }

  private toInspectOneView(input: {
    link: string | null;
    result: AdminInspectItemResult;
    title: string | null;
    description: string | null;
    avatarUrl: string | null;
    memberCount: number | null;
    linkType: 'channel' | 'group' | null;
    language: string | null;
    existing: Channel | null;
  }) {
    const visibility = input.existing
      ? describeMemberPageVisibility(input.existing)
      : null;
    const alreadyRegistered = input.result === 'already_registered';
    return {
      link: input.link ?? '',
      title: input.title ?? '',
      description: input.description ?? '',
      avatarUrl: input.avatarUrl,
      memberCount: input.memberCount,
      linkType: input.linkType,
      language: input.language,
      result: input.result,
      resultCaption: inspectItemResultCaption({
        result: input.result,
        registeredThisJob: false,
        memberVisible: visibility?.visible ?? null,
        memberReason:
          visibility && !visibility.visible ? visibility.reason : null,
      }),
      alreadyRegistered,
      // 등록 화면 카테고리 기본값(키워드 추천). 이미 등록된 행은 기존 카테고리를 그대로 쓴다.
      suggestedCategory: input.existing
        ? input.existing.category
        : suggestInspectCategory(input.title, input.description),
      existingChannelId: input.existing?.id ?? null,
      existingStatus: input.existing?.status ?? null,
      memberPageVisible: visibility?.visible ?? null,
      memberPageReason:
        visibility && !visibility.visible ? visibility.reason : null,
    };
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
    // 언어 미확인은 경고만 하므로 등록할 수 있다
    if (
      (item.result !== 'ok' && item.result !== 'language_unknown') ||
      !item.link
    ) {
      throw new Error('정상 항목만 등록할 수 있습니다.');
    }
    const existing = await this.findExisting(item.link);
    if (existing) {
      await this.itemRepository.update(item.id, {
        result: 'already_registered',
        registeredChannelId: existing.id,
      });
      // 거절된 행은 대량 등록에서 되살리지 않는다(단건 등록 화면에서 확인 후 활성화)
      throw new Error(
        existing.status === 'rejected'
          ? '이전에 거절된 링크입니다. 단건 등록에서 다시 활성화해 주세요.'
          : '이미 등록된 채널입니다.',
      );
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
      language: toChannelLanguage(item.language),
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
    const existing = await this.findExisting(item.link);
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
    const classified = await this.fetchAndClassify(item.link, item.username);
    await this.itemRepository.update(item.id, {
      result: classified.result,
      title: classified.title,
      memberCount: classified.memberCount,
      linkType: classified.linkType,
      language: classified.language,
    });
    return true;
  }

  /** 같은 링크 행(중복 판단은 ChannelsService.findDuplicate 하나만 쓴다) */
  private async findExisting(link: string): Promise<Channel | null> {
    const match = await this.channelsService.findDuplicate(link);
    return match?.channel ?? null;
  }

  /**
   * 공개 페이지를 읽어 판정한다. 공개 채널은 한국어 여부가 제목·소개만으로 안 나올 수 있어
   * t.me/s 최근 글 발췌를 한 번 더 읽는다(같은 fetcher 라 대량 검사 간격 그대로).
   */
  private async fetchAndClassify(
    link: string,
    username: string | null,
  ): Promise<AdminInspectPageClassified> {
    const isInvite = isInviteOnlyLink(link);
    const page = await this.publicFetch.fetchHtml(link);
    const base = {
      html: page.html,
      status: page.status,
      isInvite,
      finalUrl: page.finalUrl,
    };
    const first = classifyAdminInspectPage(base);
    const needsFeed =
      !isInvite &&
      Boolean(username) &&
      first.linkType === 'channel' &&
      first.language !== 'ko' &&
      first.result !== 'not_found' &&
      first.result !== 'invalid_format' &&
      first.result !== 'invite_or_private';
    if (!needsFeed || !username) return first;
    const feed = await this.publicFetch.fetchHtml(
      `https://t.me/s/${username}`,
    );
    if (!feed.html) return first;
    const excerpts = excerptsFromPreviewPosts(
      parseTelegramChannelHtml(feed.html).posts,
    );
    if (excerpts.length === 0) return first;
    return classifyAdminInspectPage({ ...base, excerpts });
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
          Boolean(item.registeredChannelId) &&
          (item.result === 'ok' || item.result === 'language_unknown');
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
