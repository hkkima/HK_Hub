// 허브 Firebase — 읽기 전용. 5앱과 같은 프로젝트(hk-chess-betting).
// users/dpAccounts/gigs/helpRequests 는 규칙상 공개 읽기라 인증 불필요.
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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

export function db() {
  if (cache) return cache;
  const config = readConfig();
  if (!config.apiKey || !config.projectId) {
    throw new Error('Firebase 설정이 없어요. apps/hub/.env 를 채워 주세요.');
  }
  const app = getApps()[0] || initializeApp(config);
  cache = getFirestore(app);
  return cache;
}
