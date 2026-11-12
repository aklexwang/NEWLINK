#!/usr/bin/env node
/**
 * 배포 전 안전검사: "엔티티에 컬럼/테이블을 추가했는데 마이그레이션이 없음"을 빌드에서 잡는다.
 *
 * 왜: 운영(Render)은 synchronize 가 꺼져 있고 마이그레이션만 돈다. 엔티티에만 컬럼을 추가하면
 * 배포 직후 "column ... does not exist" 로 서버가 죽는다(2026-11-12 실제 사고).
 * 여기서 빌드를 실패시키면 Render 는 새 버전을 띄우지 않고 기존 서버를 그대로 살려 둔다.
 *
 * 규칙: 엔티티의 모든 (테이블, 컬럼)은
 *   (a) 기준선(scripts/entity-schema-baseline.json = 이미 운영 DB 에 있는 것) 에 있거나
 *   (b) src/migrations/*.ts 안에 그 이름이 문자열로 등장하고, 그 마이그레이션이
 *       src/migrations/index.ts(ALL_MIGRATIONS)에 등록돼 있어야 한다.
 *
 * 기준선 갱신은 하지 말 것(새 컬럼은 마이그레이션으로). 정말 필요할 때만:
 *   node scripts/check-entity-migrations.js --write-baseline
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const MIG_DIR = path.join(SRC, 'migrations');
const BASELINE = path.join(__dirname, 'entity-schema-baseline.json');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.entity.ts')) out.push(p);
  }
  return out;
}

const COLUMN_DECORATORS =
  'Column|PrimaryGeneratedColumn|PrimaryColumn|CreateDateColumn|UpdateDateColumn|DeleteDateColumn|VersionColumn';

/** @returns {{table: string, columns: string[], file: string}[]} */
function readEntities() {
  const result = [];
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    const ent = text.match(/@Entity\(\s*['"]([^'"]+)['"]/);
    if (!ent) continue;
    const table = ent[1];
    const columns = [];
    const re = new RegExp(
      `@(?:${COLUMN_DECORATORS})\\s*\\(([\\s\\S]*?)\\)\\s*\\n\\s*(?:readonly\\s+)?(\\w+)\\s*[!?]?\\s*:`,
      'g',
    );
    let m;
    while ((m = re.exec(text))) {
      const args = m[1];
      const prop = m[2];
      const named = args.match(/\bname\s*:\s*['"]([^'"]+)['"]/);
      columns.push(named ? named[1] : prop);
    }
    result.push({ table, columns, file: path.relative(ROOT, file) });
  }
  return result;
}

function registeredMigrationText() {
  const indexPath = path.join(MIG_DIR, 'index.ts');
  const index = fs.readFileSync(indexPath, 'utf8');
  const files = [...index.matchAll(/from '\.\/([^']+)'/g)].map((m) => m[1]);
  const listed = new Set(
    [...index.matchAll(/^\s+(\w+),\s*$/gm)].map((m) => m[1]),
  );
  let text = '';
  const unregistered = [];
  for (const f of fs.readdirSync(MIG_DIR)) {
    if (!/^\d+-.*\.ts$/.test(f) || f.endsWith('.spec.ts')) continue;
    const base = f.replace(/\.ts$/, '');
    const body = fs.readFileSync(path.join(MIG_DIR, f), 'utf8');
    const cls = (body.match(/export class (\w+)/) || [])[1];
    if (!files.includes(base) || !cls || !listed.has(cls)) {
      unregistered.push(f);
      continue;
    }
    text += body + '\n';
  }
  return { text, unregistered };
}

const entities = readEntities();

if (process.argv.includes('--write-baseline')) {
  const baseline = {};
  for (const e of entities) baseline[e.table] = [...new Set(e.columns)].sort();
  fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`기준선 저장: ${Object.keys(baseline).length}개 테이블`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const { text: migText, unregistered } = registeredMigrationText();
const mentioned = (name) =>
  new RegExp(`['"\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(
    migText,
  );

const problems = [];
for (const f of unregistered) {
  problems.push(
    `마이그레이션 파일 ${f} 이(가) src/migrations/index.ts(ALL_MIGRATIONS)에 등록되지 않았어요.`,
  );
}
for (const e of entities) {
  const known = baseline[e.table];
  if (!known && !mentioned(e.table)) {
    problems.push(
      `새 테이블 '${e.table}' (${e.file}) 를 만드는 마이그레이션이 없어요.`,
    );
    continue;
  }
  for (const col of e.columns) {
    if (known && known.includes(col)) continue;
    if (!mentioned(col)) {
      problems.push(
        `새 컬럼 '${e.table}.${col}' (${e.file}) 를 추가하는 마이그레이션이 없어요.`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error('\n❌ 엔티티-마이그레이션 검사 실패 (이대로 배포하면 운영 서버가 죽습니다)\n');
  for (const p of problems) console.error('  - ' + p);
  console.error(
    '\n→ src/migrations/ 에 마이그레이션을 만들고 src/migrations/index.ts 에 등록하세요.\n',
  );
  process.exit(1);
}
const colCount = entities.reduce((n, e) => n + e.columns.length, 0);
console.log(
  `✅ 엔티티-마이그레이션 검사 통과 (테이블 ${entities.length}, 컬럼 ${colCount})`,
);
