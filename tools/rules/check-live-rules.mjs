#!/usr/bin/env node
// 라이브 firestore.rules ↔ 리포 사본 대조.
//
//   ★규칙 배포에서 진짜 위험한 건 병합 실수가 아니라 "리포가 라이브와 다른 것"이다★
//   `firebase deploy --only firestore:rules` 는 룰셋을 통째로 교체한다. 누군가 콘솔에서
//   규칙을 직접 고쳤다면, 리포 사본을 배포하는 순간 그 변경이 조용히 사라진다.
//   리포 파일이 마지막 배포본이라는 보장은 어디에도 없다.
//
//   그래서 배포 전에 반드시 라이브를 받아와 대조한다. 다르면 멈춘다.
//
//   사용법:
//     GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
//       node scripts/check-live-rules.mjs ../HK_Stock/firestore.rules [--save live.rules]
//
//   `--save` 를 주면 라이브 소스를 그 경로에 저장한다. 라이브가 리포보다 최신일 때
//   (다른 레포에서 배포한 블록이 들어 있을 때) 그 파일을 새 기준으로 삼으면 된다.
//
//   필요 권한: `Firebase Rules Viewer` (roles/firebaserules.viewer) — 읽기 전용이면 충분하다.
//   ★배포용 키를 쓰지 말고 조회 전용 서비스 계정을 따로 파는 걸 권한다★
//   (이 스크립트는 아무것도 쓰지 않는다).
//
//   의존성 없음 — JWT 서명부터 토큰 교환까지 node:crypto 로 직접 한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const PROJECT = process.env.FIREBASE_PROJECT || 'hk-chess-betting';
const SCOPE = 'https://www.googleapis.com/auth/firebase.readonly';

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const localPath = process.argv[2];
if (!localPath) fail('사용법: node scripts/check-live-rules.mjs <HK_Stock/firestore.rules> [--save <경로>]');
const saveIdx = process.argv.indexOf('--save');
const savePath = saveIdx > 0 ? process.argv[saveIdx + 1] : null;
if (saveIdx > 0 && !savePath) fail('--save 뒤에 저장 경로가 필요합니다.');

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) fail('GOOGLE_APPLICATION_CREDENTIALS 에 서비스 계정 JSON 경로를 지정하세요.');

let key;
try {
  key = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch (e) {
  fail(`서비스 계정 키를 읽지 못했습니다: ${e.message}`);
}
if (!key.client_email || !key.private_key) fail('서비스 계정 JSON 형식이 아닙니다.');

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 서비스 계정 JWT → OAuth 액세스 토큰. */
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(key.private_key));

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  const j = await res.json();
  if (!res.ok) fail(`토큰 발급 실패 (${res.status}): ${j.error_description || j.error || ''}`);
  return j.access_token;
}

async function api(token, path) {
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (!res.ok) {
    const m = j.error?.message || res.statusText;
    if (res.status === 403) {
      fail(`권한 없음 (403): ${m}\n  서비스 계정에 roles/firebaserules.viewer 를 부여하세요.`);
    }
    fail(`API 오류 (${res.status}): ${m}`);
  }
  return j;
}

const token = await getAccessToken();

// 현재 배포된 릴리스 → 룰셋 → 소스
const release = await api(token, `projects/${PROJECT}/releases/cloud.firestore`);
const rulesetName = release.rulesetName;
if (!rulesetName) fail('cloud.firestore 릴리스에 rulesetName 이 없습니다.');
const ruleset = await api(token, rulesetName);

const files = ruleset.source?.files || [];
if (files.length !== 1) {
  console.warn(`⚠ 룰셋 파일이 ${files.length}개입니다(보통 1개). 전부 이어서 비교합니다.`);
}
const live = files.map((f) => f.content).join('\n');
const local = readFileSync(localPath, 'utf8');

if (savePath) {
  writeFileSync(savePath, live);
  console.log(`· 라이브 소스를 저장했습니다 → ${savePath}`);
}

const norm = (s) => s.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trimEnd();
const same = norm(live) === norm(local);

console.log(`프로젝트    ${PROJECT}`);
console.log(`룰셋        ${rulesetName.split('/').pop()}`);
console.log(`생성 시각   ${ruleset.createTime || '?'}`);
console.log(`라이브      ${norm(live).split('\n').length} 줄`);
console.log(`리포 사본   ${norm(local).split('\n').length} 줄  (${localPath})`);
console.log();

if (same) {
  console.log('✓ 라이브와 리포 사본이 동일합니다. 병합·배포를 진행해도 안전합니다.');
  process.exit(0);
}

// 다르면 어디가 다른지 보여 준다(줄 단위 최소 정보).
const L = norm(live).split('\n');
const R = norm(local).split('\n');
const liveOnly = L.filter((l) => !R.includes(l));
const localOnly = R.filter((l) => !L.includes(l));

console.error('✗ 라이브와 리포 사본이 다릅니다. ★그대로 배포하면 라이브 변경이 사라집니다★');
console.error(`\n라이브에만 있는 줄 (${liveOnly.length}개) — 배포하면 없어집니다:`);
liveOnly.slice(0, 40).forEach((l) => console.error(`  - ${l}`));
if (liveOnly.length > 40) console.error(`  … 외 ${liveOnly.length - 40}줄`);
console.error(`\n리포에만 있는 줄 (${localOnly.length}개):`);
localOnly.slice(0, 40).forEach((l) => console.error(`  + ${l}`));
if (localOnly.length > 40) console.error(`  … 외 ${localOnly.length - 40}줄`);
console.error('\n조치: 라이브 쪽 변경을 리포에 먼저 반영(커밋)한 뒤 다시 확인하세요.');
console.error('      전체 라이브 소스를 저장하려면:  --save live.rules');
process.exit(1);
