#!/usr/bin/env node
// firestore.rules 병합기 — 앱 조각을 통합 규칙에 끼워 넣는다.  ★HK 공용 도구★
//
//   ★프로젝트당 규칙 파일은 하나뿐이다★. hk-chess-betting 을 7개 앱이 공유하므로,
//   각 앱이 자기 사본을 들고 배포하면 **마지막에 배포한 앱이 나머지를 지운다**.
//   2026-08-04 하루에만 두 번 일어났다(§docs/INTEGRATION.md 3.1.4):
//     07:11 카지노 배포 — 직전에 라이브 대조를 해서 게임허브 블록을 살렸다
//     07:50 게임허브 배포 — 자기 리포 기준이라 카지노 블록이 통째로 날아갔다
//
//   그래서 규칙은 반드시 이 순서로만 만진다:
//     ① check-live-rules.mjs --save live.rules   ← 기준은 리포가 아니라 ★라이브★
//     ② merge-rules.mjs live.rules merged.rules  ← 내 조각만 끼워 넣기
//     ③ deploy-rules.mjs merged.rules --confirm  ← 사라지는 match 가 있으면 거부
//
//   사용법:
//     node scripts/merge-rules.mjs <기준 rules> [출력 경로] [--fragment <조각>] [--label <이름>]
//
//   ★다른 HK 앱도 이 스크립트를 그대로 쓸 수 있다★ — 자기 조각 경로만 넘기면 된다:
//     node <HK_Hub>/tools/rules/merge-rules.mjs live.rules merged.rules --fragment firestore.rules.gamehub --label gamehub
//
//   ★멱등★ — 같은 label 블록이 이미 있으면 새 것으로 교체한다(중복 삽입하지 않는다).
//
//   ※ 정본은 HK_Hub/tools/rules/ (거버넌스: docs/GOVERNANCE.md). HK_Gamble/scripts/ 사본은
//     과도기 호환용이며, 그쪽은 ROOT 가 HK_Gamble 리포에 고정돼 있어 타 앱에서 상대 조각명이 안 풀렸다.
//     이 판은 조각을 ★호출한 디렉토리(CWD)★ 기준으로 찾는다 — 각 앱 루트에서 실행하면 된다.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.cwd();

function argOf(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const LABEL = argOf('--label', 'casino');
const FRAGMENT = argOf('--fragment', 'firestore.rules.casino');
const BEGIN = `    // ══════ BEGIN ${LABEL} — scripts/merge-rules.mjs 가 관리한다 ══════`;
const END = `    // ══════ END ${LABEL} ══════`;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/**
 * 조각 파일에서 실제 규칙 부분만 뽑는다(맨 위 설명 주석 블록은 버린다).
 * 규칙 본문은 4칸 들여쓴 `    //` 주석이나 `    match` 로 시작한다 — 그 첫 줄부터가 본문이다.
 */
function readFragment() {
  const path = FRAGMENT.includes('/') ? resolve(FRAGMENT) : join(ROOT, FRAGMENT);
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^ {4}(?:\/\/|match|function)/m);
  if (!m) fail(`${FRAGMENT} 에서 규칙 본문(4칸 들여쓰기)을 찾지 못했습니다.`);
  return raw.slice(m.index).trimEnd();
}

/** 중괄호 균형 — 붙여넣기 사고를 잡는 가장 값싼 검사. */
function braceBalance(src) {
  let depth = 0;
  let inLineComment = false;
  let inString = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inString) { if (c === "'") inString = false; continue; }
    if (c === '/' && src[i + 1] === '/') { inLineComment = true; i += 1; continue; }
    if (c === "'") { inString = true; continue; }
    if (c === '{') depth += 1;
    if (c === '}') { depth -= 1; if (depth < 0) return -1; }
  }
  return depth;
}

const [, , stockRulesPath, outPathArg] = process.argv;
if (!stockRulesPath) {
  fail('사용법: node scripts/merge-rules.mjs <HK_Stock/firestore.rules> [출력 경로]');
}

const stockPath = resolve(stockRulesPath);
const outPath = resolve(outPathArg || stockRulesPath);

let base = readFileSync(stockPath, 'utf8');

// 이미 삽입돼 있으면 통째로 걷어낸다(멱등).
//
//   ★표식은 '고정 문자열'이 아니라 정규식으로 찾는다★ — 표식 문구를 한 글자라도 바꾸면
//   과거에 배포된 블록을 못 찾아 **두 번째 블록이 덧붙는다**(같은 match 가 중복되면
//   규칙이 깨지거나 앞쪽 블록이 뒤쪽에 가려진다). 실제로 이 스크립트를 일반화하면서
//   `BEGIN casino (HK_Gamble)` → `BEGIN casino` 로 바꿨다가 그 상황을 만들 뻔했다.
//   그래서 `BEGIN <label>` 까지만 보고 뒤에 뭐가 붙어 있든 같은 블록으로 취급한다.
const beginRe = new RegExp(`^[ \\t]*//[ ═=─-]*BEGIN[ ]+${LABEL}\\b.*$`, 'm');
const endRe = new RegExp(`^[ \\t]*//[ ═=─-]*END[ ]+${LABEL}\\b.*$`, 'm');
const bm = base.match(beginRe);
if (bm) {
  const em = base.match(endRe);
  if (!em) fail(`BEGIN ${LABEL} 표식은 있는데 END 표식이 없습니다. 대상 파일을 손으로 확인하세요.`);
  const from0 = bm.index;
  const to = em.index + em[0].length + 1; // 표식 줄 + 개행
  if (to <= from0) fail('END 표식이 BEGIN 보다 앞에 있습니다. 대상 파일을 손으로 확인하세요.');
  // 삽입할 때 BEGIN 앞에 개행을 하나 붙였으므로 걷어낼 때도 같이 뗀다.
  // 안 그러면 돌릴 때마다 빈 줄이 하나씩 쌓여 파일이 조금씩 달라진다(멱등이 깨진다).
  const from = from0 > 0 && base[from0 - 1] === '\n' ? from0 - 1 : from0;
  base = base.slice(0, from) + base.slice(to);
  console.log(`· 기존 ${LABEL} 블록을 제거하고 새로 넣습니다.`);
}

// 마지막 두 개의 닫는 중괄호(= documents 블록, service 블록) 앞에 끼워 넣는다.
const closeIdx = base.lastIndexOf('\n  }\n}');
if (closeIdx < 0) {
  fail("대상 파일 끝에서 '  }\\n}' 패턴을 찾지 못했습니다. rules 구조가 예상과 다릅니다.");
}

const block = `\n${BEGIN}\n${readFragment()}\n${END}\n`;
const merged = base.slice(0, closeIdx) + block + base.slice(closeIdx);

// ── 검증 ──────────────────────────────────────────────
const balance = braceBalance(merged);
if (balance !== 0) fail(`중괄호가 맞지 않습니다(잔여 ${balance}). 병합하지 않았습니다.`);

// ★기존 블록 보존 검사 — 하드코딩 목록이 아니라 '입력 파일에서 추출'한다★
//
//   처음엔 필수 match 를 손으로 나열했는데, 그 방식은 새 앱이 추가될 때마다 낡는다.
//   실제로 2026-08 에 라이브 규칙에 HK_GameHub 블록이 들어와 있었고,
//   하드코딩 목록에는 없어서 통과했을 것이다(= 배포하면 게임허브 좋아요가 죽는다).
//   그래서 "입력에 있던 match 는 출력에도 전부 있어야 한다"로 바꿨다. 낡지 않는다.
// 경로에 `{userId}` 같은 와일드카드가 들어 있으므로 `[^{]` 로 자르면 안 된다.
// 여는 중괄호는 경로 뒤 공백 다음에 온다 → 공백 없는 덩어리를 통째로 잡고 ` {` 로 끝을 확인한다.
const matchesOf = (src) => [...src.matchAll(/match\s+(\S+)\s*\{/g)].map((m) => m[1]);
const before = matchesOf(base);
const after = new Set(matchesOf(merged));
const dropped = before.filter((m) => !after.has(m));
if (dropped.length) {
  fail(`병합 과정에서 기존 match 블록이 사라졌습니다(배포하면 해당 앱이 죽습니다):\n  - ${dropped.join('\n  - ')}`);
}
// 헬퍼 함수도 마찬가지 — 규칙 본문이 참조하는데 사라지면 컴파일 자체가 실패한다.
const fnsOf = (src) => [...src.matchAll(/function\s+([A-Za-z_]\w*)\s*\(/g)].map((m) => m[1]);
const lostFns = fnsOf(base).filter((f) => !fnsOf(merged).includes(f));
if (lostFns.length) fail(`헬퍼 함수가 사라졌습니다:\n  - ${lostFns.join('\n  - ')}`);

// 조각이 실제로 들어갔는지 — 조각 파일에서 match 를 추출해 대조한다(하드코딩 없음).
const fragMatches = matchesOf(readFragment());
if (!fragMatches.length) fail(`${FRAGMENT} 에 match 블록이 없습니다.`);
const missing = fragMatches.filter((m) => !after.has(m));
if (missing.length) fail(`병합 결과에 조각 블록이 없습니다:\n  - ${missing.join('\n  - ')}`);

// 카지노 전용 안전장치 — 칩 컬렉션이 쓰기 금지인지.
// 여기가 뚫리면 칩을 찍어 환전해 포인트를 발행할 수 있다.
if (after.has('/casinoChips/{userId}')) {
  const chipsBlock = merged.slice(merged.indexOf('match /casinoChips/{userId}'));
  if (!/allow write:\s*if false/.test(chipsBlock.slice(0, 200))) {
    fail('casinoChips 에 `allow write: if false` 가 없습니다. 포인트 발행 경로가 열립니다.');
  }
}

writeFileSync(outPath, merged);
console.log(`✓ 병합 완료 → ${outPath}`);
console.log(`  중괄호 균형 OK`);
console.log(`  기존 match ${before.length}개 전부 보존 · 헬퍼 함수 ${fnsOf(base).length}개 보존`);
console.log(`  ${LABEL} match ${fragMatches.length}개 추가 (${FRAGMENT})`);
console.log('\n다음:  cd <HK_Stock> && firebase deploy --only firestore:rules --project hk-chess-betting');
