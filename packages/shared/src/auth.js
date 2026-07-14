// 참가자 이름 + 숫자 PIN 로그인. PIN은 평문 저장하지 않고 해시만 보관.
//
// ★★★ 정본(canonical) ★★★
//   HK_Betting / HK_Stock / HK_Judge / HK_Board / HK_DP 5앱이 같은 `users/{id}` 문서를
//   공유한다. 따라서 이 해시/정규화는 5앱에서 반드시 '바이트 단위로 동일'해야 한다.
//   (기존 5앱의 src/auth/auth.js 는 주석만 달랐고 로직은 전부 동일 — 그 정본을 여기로 승격.)
//   변경 시 기존 수강생 PIN이 전부 깨진다. auth.test.js 의 골든값이 드리프트를 차단한다.
//
// ⚠️ 경량 해시(djb2) — 캐주얼 수업용. 금전 가치가 큰 용도면 교체(그 땐 마이그레이션 필요).

export function normalizeId(id) {
  return String(id || '').trim().toLowerCase();
}

// userId 는 이름을 정규화한 슬러그(공백→_). 충돌 시 운영자가 뒤에 숫자 부여.
export function nameToUserId(name) {
  return normalizeId(name).replace(/\s+/g, '_');
}

export function hashPin(pin) {
  const s = String(pin);
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return 'pin_' + (h >>> 0).toString(16);
}

export function verifyPin(pin, hash) {
  return hashPin(pin) === hash;
}
