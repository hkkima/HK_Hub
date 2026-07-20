// 허브 Firebase — 5앱과 같은 프로젝트(hk-chess-betting).
//   읽기: users/dpAccounts/gigs/stocks(=팀)/teamLedger 등은 규칙상 공개 읽기라 인증 불필요.
//   쓰기: 전부 Cloud Functions 경유. CEO 기능=익명인증(assertAuth), 운영자 기능=Google 로그인(assertAdmin).
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
} from 'firebase/auth';

function readConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

let cache = null;

export function isConfigured() {
  const c = readConfig();
  return Boolean(c.apiKey && c.projectId);
}

function fb() {
  if (cache) return cache;
  const config = readConfig();
  if (!config.apiKey || !config.projectId) {
    throw new Error('Firebase 설정이 없어요. apps/hub/.env 를 채워 주세요.');
  }
  const app = getApps()[0] || initializeApp(config);
  const region = import.meta.env.VITE_FUNCTIONS_REGION || 'asia-northeast3';
  cache = { app, db: getFirestore(app), auth: getAuth(app), functions: getFunctions(app, region) };
  return cache;
}

export function db() { return fb().db; }

// ── 인증 ───────────────────────────────────────────────
let anonPromise = null;
// 참가자(CEO)용 익명 로그인 — 콜러블 assertAuth 통과에 필요.
export function ensureAnonAuth() {
  let auth;
  try { auth = fb().auth; } catch { return Promise.resolve(null); }
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (!anonPromise) {
    anonPromise = signInAnonymously(auth).then((c) => c.user).catch((e) => {
      console.warn('익명 로그인 실패:', e.code || e.message);
      return null;
    });
  }
  return anonPromise;
}

// 운영자 Google 로그인 — assertAdmin 통과용.
export async function signInWithGoogle() {
  const { auth } = fb();
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  return cred.user;
}

export function watchAuth(cb) {
  try { return onAuthStateChanged(fb().auth, cb); } catch { cb(null); return () => {}; }
}

export function adminEmails() {
  const raw = import.meta.env.VITE_ADMIN_EMAILS || '';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email) {
  const list = adminEmails();
  if (!email) return false;
  if (list.length === 0) return true; // 미설정 시 로컬 테스트 허용
  return list.includes(String(email).toLowerCase());
}

// ── 콜러블 래퍼 ────────────────────────────────────────
//   CEO 기능은 익명인증이 먼저 붙어야 하므로 호출 전 ensureAnonAuth().
export function callable(name, { needAnon = true } = {}) {
  return async (data) => {
    if (needAnon) await ensureAnonAuth();
    const fn = httpsCallable(fb().functions, name);
    try {
      const res = await fn(data);
      return res.data;
    } catch (e) {
      const code = String(e?.code || '');
      if (/unauthenticated/.test(code)) throw new Error('인증이 만료됐어요. 새로고침 후 다시 시도해 주세요.');
      if (/permission-denied/.test(code)) throw new Error(e.message || '권한이 없습니다(대표 또는 운영자만).');
      if (/failed-precondition/.test(code)) throw new Error(e.message || '조건을 만족하지 않습니다.');
      throw new Error(e.message || '처리 중 오류가 발생했습니다.');
    }
  };
}
