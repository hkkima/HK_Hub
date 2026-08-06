#!/usr/bin/env node
// firestore.rules 배포 — Firebase Rules API 직접 호출. 의존성 없음.
//
//   firebase CLI 없이 서비스 계정만으로 규칙을 배포한다(CI·에이전트 환경용).
//
//   ★안전 구조★ — Rules API 는 2단계라 사고가 나기 어렵다.
//     1) 룰셋 생성(POST rulesets) : 여기서 **문법 검증**이 일어난다. 실패하면 라이브는 그대로.
//     2) 릴리스 갱신(PATCH releases/cloud.firestore) : 이 순간에만 라이브가 바뀐다.
//   그래서 컴파일 에러가 있는 규칙이 라이브로 나가는 일은 구조적으로 없다.
//
//   배포 전에 항상 현재 라이브를 백업 파일로 떨어뜨린다(롤백용).
//   Firebase 는 과거 룰셋을 보관하므로, 롤백은 이전 rulesetName 으로 릴리스만 되돌리면 된다.
//
//   사용법:
//     GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json \
//       node scripts/deploy-rules.mjs <배포할 rules 파일> --confirm [--backup <경로>]
//
//   ★--confirm 없이는 절대 배포하지 않는다★ (드라이런: 검증 + 변경 요약만 출력)
//   필요 권한: roles/firebaserules.admin
import { readFileSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const PROJECT = process.env.FIREBASE_PROJECT || 'hk-chess-betting';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const RELEASE = `projects/${PROJECT}/releases/cloud.firestore`;

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const rulesPath = process.argv[2];
if (!rulesPath) fail('사용법: node scripts/deploy-rules.mjs <rules 파일> --confirm [--backup <경로>]');
const confirmed = process.argv.includes('--confirm');
const bi = process.argv.indexOf('--backup');
const backupPath = bi > 0 ? process.argv[bi + 1] : null;

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) fail('GOOGLE_APPLICATION_CREDENTIALS 에 서비스 계정 JSON 경로를 지정하세요.');
const key = JSON.parse(readFileSync(keyPath, 'utf8'));
if (!key.client_email || !key.private_key) fail('서비스 계정 JSON 형식이 아닙니다.');

const source = readFileSync(rulesPath, 'utf8');
if (!/service\s+cloud\.firestore/.test(source)) {
  fail('firestore 규칙 파일로 보이지 않습니다(service cloud.firestore 없음).');
}

const b64url = (b) => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const s = createSign('RSA-SHA256');
  s.update(`${header}.${claim}`);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${b64url(s.sign(key.private_key))}`,
    }),
  });
  const j = await res.json();
  if (!res.ok) fail(`토큰 발급 실패 (${res.status}): ${j.error_description || j.error}`);
  return j.access_token;
}

async function api(token, path, init = {}) {
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const m = j.error?.message || res.statusText;
    if (res.status === 403) fail(`권한 없음 (403): ${m}\n  roles/firebaserules.admin 이 필요합니다.`);
    fail(`API 오류 (${res.status}) ${path}: ${m}`);
  }
  return j;
}

const token = await getAccessToken();

// ── 현재 라이브 확보(백업 + 비교) ─────────────────────────────
const cur = await api(token, RELEASE);
const curRuleset = await api(token, cur.rulesetName);
const curSource = (curRuleset.source?.files || []).map((f) => f.content).join('\n');

console.log(`프로젝트      ${PROJECT}`);
console.log(`현재 룰셋     ${cur.rulesetName.split('/').pop()}  (${curRuleset.createTime})`);
console.log(`배포할 파일   ${rulesPath}`);
console.log();

if (backupPath) {
  writeFileSync(backupPath, curSource);
  console.log(`· 현재 라이브 백업 → ${backupPath}`);
}

const norm = (s) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
if (norm(curSource) === norm(source)) {
  console.log('✓ 라이브와 동일합니다. 배포할 변경이 없습니다.');
  process.exit(0);
}

// 변경 요약 — match 블록 단위로 무엇이 늘고 주는지
const matchesOf = (s) => [...s.matchAll(/match\s+(\S+)\s*\{/g)].map((m) => m[1]);
const curM = matchesOf(curSource);
const newM = matchesOf(source);
const removed = curM.filter((m) => !newM.includes(m));
const added = newM.filter((m) => !curM.includes(m));

console.log(`변경  +${norm(source).split('\n').length - norm(curSource).split('\n').length} 줄`);
if (added.length) console.log(`추가되는 match (${added.length}):\n  + ${added.join('\n  + ')}`);
if (removed.length) {
  console.log(`\n★사라지는 match (${removed.length})★ — 해당 앱이 즉시 동작을 멈춥니다:`);
  console.log(`  - ${removed.join('\n  - ')}`);
}
console.log();

// ★기존 블록을 지우는 배포는 --confirm 만으로 통과시키지 않는다★
if (removed.length && !process.argv.includes('--allow-removal')) {
  fail('기존 match 블록이 사라지는 배포입니다. 의도한 것이면 --allow-removal 을 추가하세요.');
}

if (!confirmed) {
  console.log('드라이런입니다. 실제 배포하려면 --confirm 을 붙이세요.');
  process.exit(0);
}

// ── 1) 룰셋 생성 = 문법 검증 (라이브 무변경) ──────────────────
const created = await api(token, `projects/${PROJECT}/rulesets`, {
  method: 'POST',
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: source }] } }),
});
console.log(`· 룰셋 생성·검증 통과 → ${created.name.split('/').pop()}`);

// ── 2) 릴리스 갱신 = 이 순간 라이브 변경 ──────────────────────
await api(token, RELEASE, {
  method: 'PATCH',
  body: JSON.stringify({ release: { name: RELEASE, rulesetName: created.name } }),
});
console.log('· 릴리스 갱신 완료');

// ── 3) 되읽어 확인 ────────────────────────────────────────────
const after = await api(token, RELEASE);
const afterRuleset = await api(token, after.rulesetName);
const afterSource = (afterRuleset.source?.files || []).map((f) => f.content).join('\n');
if (norm(afterSource) !== norm(source)) fail('배포 후 라이브가 배포한 내용과 다릅니다. 즉시 확인하세요.');

console.log(`\n✓ 배포 완료. 라이브 룰셋 = ${after.rulesetName.split('/').pop()}`);
console.log(`  롤백하려면 이전 룰셋으로 릴리스만 되돌리면 됩니다:`);
console.log(`    이전 = ${cur.rulesetName.split('/').pop()}`);
