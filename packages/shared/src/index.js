// @hk/shared — HK 통합 공유 패키지 진입점.
//
// STEP 1 진행 중 — 5앱 복붙 코드를 여기로 추출한다(비파괴, 앱 하나씩 전환):
//   [✓] auth.js    : name+PIN 해시·id 정규화 (정본, 5앱 동일 확인 + 골든 테스트)
//   [ ] firebase.js: 앱 초기화 + isAdmin(VITE_ADMIN_EMAILS) + callable 래퍼(메시지 파라미터화)
//   [ ] wallet.js  : users/{id} 구독·생성 (잔액 컨텍스트, 공용 헤더)
//   [ ] callables.js: Cloud Functions 타입드 클라이언트(관리 대시보드/운영 PM 공유)
//   [ ] ui/        : 헤더, 로그인 카드, 버튼/토스트 (DESIGN-SYSTEM-PROMPT.md 토큰)
//
// 불변식은 docs/CONVENTIONS.md 참조 — 포인트 증가는 함수 경유만, rules 단일본, admin 일원화.

export { normalizeId, nameToUserId, hashPin, verifyPin } from './auth.js';
