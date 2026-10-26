import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { SearchTerm } from './analytics.entities';
import {
  checkSearchText,
  validateTermInput,
  type SearchCheckResult,
  type SearchTermSets,
} from './search-text.logic';

export type SearchTermKind = 'block' | 'allow';

/** 금지어 목록 캐시 유효 시간 */
const CACHE_TTL_MS = 30_000;

export interface SearchTermView {
  id: string;
  kind: SearchTermKind;
  term: string;
  termNormalized: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** 예외어가 어떤 금지어도 포함하지 않을 때 어드민에게 알리는 안내 */
  warning?: string;
}

/**
 * 검색 금지어·예외어 관리와 판정.
 * 판정은 30초 메모리 캐시를 쓰고, 어드민이 바꾸면 즉시 캐시를 비운다.
 * (서버가 여러 대면 다른 서버는 최대 30초 뒤에 반영된다.)
 */
@Injectable()
export class SearchTermsService {
  private cache: { at: number; sets: SearchTermSets } | null = null;

  constructor(
    @InjectRepository(SearchTerm)
    private readonly repository: Repository<SearchTerm>,
  ) {}

  /** 검색어가 금지어에 걸리는지. 회원 검색 API 는 모두 이 함수를 먼저 호출한다. */
  async check(query: string | null | undefined): Promise<SearchCheckResult> {
    if (!query || !query.trim()) return { blocked: false };
    const sets = await this.loadSets();
    return checkSearchText(query, sets);
  }

  invalidateCache(): void {
    this.cache = null;
  }

  async list(): Promise<SearchTermView[]> {
    const rows = await this.repository.find({
      order: { kind: 'ASC', createdAt: 'DESC' },
    });
    const enabledBlocks = rows
      .filter((row) => row.kind === 'block' && row.enabled)
      .map((row) => row.termNormalized);
    return rows.map((row) => this.toView(row, enabledBlocks));
  }

  async create(kind: string, term: string): Promise<SearchTermView> {
    const safeKind = this.parseKind(kind);
    const trimmed = (term ?? '').trim();
    const checked = validateTermInput(trimmed);
    if ('error' in checked) throw new BadRequestException(checked.error);

    const exists = await this.repository.findOne({
      where: { kind: safeKind, termNormalized: checked.normalized },
    });
    if (exists) throw new ConflictException('이미 등록된 단어입니다.');

    const now = new Date();
    const row = this.repository.create({
      id: randomUUID(),
      kind: safeKind,
      term: trimmed.slice(0, 64),
      termNormalized: checked.normalized,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    await this.repository.insert(row);
    this.invalidateCache();
    return this.toView(row, await this.enabledBlockTerms());
  }

  async update(
    id: string,
    patch: { enabled?: boolean; term?: string },
  ): Promise<SearchTermView> {
    const row = await this.repository.findOne({ where: { id } });
    if (!row) throw new NotFoundException('단어를 찾을 수 없습니다.');

    if (patch.term !== undefined) {
      const trimmed = patch.term.trim();
      const checked = validateTermInput(trimmed);
      if ('error' in checked) throw new BadRequestException(checked.error);
      if (checked.normalized !== row.termNormalized) {
        const duplicate = await this.repository.findOne({
          where: { kind: row.kind, termNormalized: checked.normalized },
        });
        if (duplicate) throw new ConflictException('이미 등록된 단어입니다.');
      }
      row.term = trimmed.slice(0, 64);
      row.termNormalized = checked.normalized;
    }
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    row.updatedAt = new Date();
    await this.repository.save(row);
    this.invalidateCache();
    return this.toView(row, await this.enabledBlockTerms());
  }

  async remove(id: string): Promise<{ ok: true }> {
    const result = await this.repository.delete({ id });
    if (!result.affected)
      throw new NotFoundException('단어를 찾을 수 없습니다.');
    this.invalidateCache();
    return { ok: true };
  }

  private parseKind(kind: string): SearchTermKind {
    if (kind === 'block' || kind === 'allow') return kind;
    throw new BadRequestException('종류는 block 또는 allow 여야 합니다.');
  }

  private async enabledBlockTerms(): Promise<string[]> {
    const rows = await this.repository.find({
      where: { kind: 'block', enabled: true },
    });
    return rows.map((row) => row.termNormalized);
  }

  private toView(row: SearchTerm, enabledBlocks: string[]): SearchTermView {
    const view: SearchTermView = {
      id: row.id,
      kind: row.kind as SearchTermKind,
      term: row.term,
      termNormalized: row.termNormalized,
      enabled: row.enabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
    if (
      row.kind === 'allow' &&
      !enabledBlocks.some((block) => row.termNormalized.includes(block))
    ) {
      view.warning =
        '이 예외어를 포함하는 켜진 금지어가 없어 지금은 효과가 없습니다.';
    }
    return view;
  }

  private async loadSets(): Promise<SearchTermSets> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) {
      return this.cache.sets;
    }
    let rows: SearchTerm[];
    try {
      rows = await this.repository.find({ where: { enabled: true } });
    } catch (error) {
      // 일시적 DB 오류면 마지막으로 알던 목록을 계속 쓴다. 처음부터 실패하면 그대로 던진다.
      if (this.cache) return this.cache.sets;
      throw error;
    }
    const sets: SearchTermSets = {
      block: rows
        .filter((row) => row.kind === 'block')
        .map((row) => row.termNormalized),
      allow: rows
        .filter((row) => row.kind === 'allow')
        .map((row) => row.termNormalized),
    };
    this.cache = { at: now, sets };
    return sets;
  }
}
