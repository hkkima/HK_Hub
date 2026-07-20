// 공유 데이터 읽기 — 전부 공개 읽기(rules). 쓰기는 각 앱/함수가 담당, 허브는 읽기만.
import {
  doc, collection, getDoc, getDocs, onSnapshot, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db, callable } from './firebase.js';

// 로그인용 조회(공개 읽기).
//   ⚠ 문서 ID가 항상 이름 슬러그인 건 아니다(예: 박지수=pj15oo, 이유진=yoojin).
//   ① 슬러그 ID로 직접 조회 → ② 없으면 name 필드로 쿼리 폴백. HK_Stock 의 getUserByName 과 동일 취지.
export async function fetchUser(userId, rawName) {
  const snap = await getDoc(doc(db(), 'users', userId));
  if (snap.exists()) return { id: snap.id, ...snap.data() };

  const nm = String(rawName ?? userId).trim();
  if (!nm) return null;
  const qs = await getDocs(query(collection(db(), 'users'), where('name', '==', nm)));
  if (qs.empty) return null;
  const d = qs.docs[0];
  return { id: d.id, ...d.data() };
}

// 내 포인트(users/{id}.balance) 실시간 구독.
export function watchUser(userId, cb) {
  return onSnapshot(doc(db(), 'users', userId),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

// 내 DP(dpAccounts/{id}.dp) 실시간 구독. 문서 없으면 0.
export function watchDp(userId, cb) {
  return onSnapshot(doc(db(), 'dpAccounts', userId),
    (snap) => cb(snap.exists() ? (snap.data().dp || 0) : 0));
}

// 내가 얽힌 외주(gigs) — 의뢰자(requesterId) 또는 작업자(workerId) 또는 지원자(applicants).
// 전체 구독 후 클라에서 필터(gigs 규모가 작음 · 공개 읽기).
export function watchMyGigs(userId, cb) {
  return onSnapshot(collection(db(), 'gigs'), (snap) => {
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const mine = all.filter((g) =>
      g.requesterId === userId
      || g.workerId === userId
      || (Array.isArray(g.applicants) && g.applicants.includes(userId)));
    cb(mine);
  });
}

// 내가 얽힌 봉사(helpRequests) — 요청자(requesterId) 또는 봉사자(volunteers[]).
export function watchMyHelp(userId, cb) {
  return onSnapshot(collection(db(), 'helpRequests'), (snap) => {
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const mine = all.filter((h) =>
      h.requesterId === userId
      || (Array.isArray(h.volunteers) && h.volunteers.includes(userId)));
    cb(mine);
  });
}

// 내 주식 보유(holdings) — userId 필터. 문서: { userId, stockId, shares, avgCost }.
export function watchMyHoldings(userId, cb) {
  return onSnapshot(collection(db(), 'holdings'), (snap) => {
    const mine = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((h) => h.userId === userId);
    cb(mine);
  });
}

// 전체 사용자(이름 표시용) — 공개 읽기.
export function watchAllUsers(cb) {
  return onSnapshot(collection(db(), 'users'), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

// ── 팀 경제(팀 포인트) — ★팀 = 주식★ ────────────────────
//   팀 정보(대표·금고·팀원)는 stocks/{id} 에 있다. 상장=팀 생성(HK_Stock 관리자), 상폐=팀 해산.
export function watchTeams(cb) {
  return onSnapshot(collection(db(), 'stocks'), (snap) =>
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

// 팀 원장(공개 — 학급 감시). 최근 30건.
//   ⚠ where + orderBy 복합 쿼리는 Firestore 색인을 요구하므로 where 만 쓰고 정렬은 클라에서(색인 불필요).
export function watchTeamLedger(stockId, cb) {
  return onSnapshot(
    query(collection(db(), 'teamLedger'), where('stockId', '==', stockId)),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.ts?.seconds || 0) - (a.ts?.seconds || 0));
      cb(rows.slice(0, 30));
    },
    (e) => { console.warn('원장 구독 실패:', e.code); cb([]); },
  );
}

// CEO 집행(익명인증) — 함수가 stocks.ceoUserId + PIN 검증.
export const paySalary = callable('paySalary');
export const payBonus = callable('payBonus');
export const payTeamDividend = callable('payTeamDividend');
// 운영자 집행(Google 로그인 필요) — assertAdmin. 상장 자체는 HK_Stock 관리자에서.
export const grantTeamPoints = callable('grantTeamPoints', { needAnon: false });

// 종목 시세 맵 { stockId: { price, name } } — 평가액 계산용.
export function watchStocks(cb) {
  return onSnapshot(collection(db(), 'stocks'), (snap) => {
    const map = {};
    snap.docs.forEach((d) => { const s = d.data(); map[d.id] = { price: s.price || 0, name: s.name || d.id }; });
    cb(map);
  });
}
