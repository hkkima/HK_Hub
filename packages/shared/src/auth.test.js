// 골든 테스트 — 이 해시값은 라이브 수강생의 저장된 PIN 해시와 일치한다.
// ★ 값이 바뀌면 5앱 전원의 로그인이 깨진다. 절대 갱신하지 말고, 깨지면 코드를 되돌려라. ★
import { describe, it, expect } from 'vitest';
import { normalizeId, nameToUserId, hashPin, verifyPin } from './auth.js';

describe('hashPin — 라이브 users 문서와 호환되는 djb2 (동결)', () => {
  it('알려진 PIN → 알려진 해시', () => {
    expect(hashPin('1234')).toBe('pin_7c540741');
    expect(hashPin('0000')).toBe('pin_7c537b05');
    expect(hashPin('9999')).toBe('pin_7c584d45');
    expect(hashPin('1')).toBe('pin_2b594');
    expect(hashPin('')).toBe('pin_1505');
  });
  it('숫자/문자 입력을 동일 취급(String 캐스팅)', () => {
    expect(hashPin(1234)).toBe(hashPin('1234'));
  });
  it('verifyPin 왕복', () => {
    expect(verifyPin('1234', 'pin_7c540741')).toBe(true);
    expect(verifyPin('0000', 'pin_7c540741')).toBe(false);
  });
});

describe('id 정규화 (동결)', () => {
  it('nameToUserId: 소문자·trim·공백→_', () => {
    expect(nameToUserId('Kim Chulsoo')).toBe('kim_chulsoo');
    expect(nameToUserId('  Alice  ')).toBe('alice');
    expect(nameToUserId('철수 팀장')).toBe('철수_팀장');
  });
  it('normalizeId: null/undefined 안전', () => {
    expect(normalizeId(null)).toBe('');
    expect(normalizeId(undefined)).toBe('');
  });
});
