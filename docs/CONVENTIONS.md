# 크로스-repo 규약 (HK 통합 플랫폼)

> STEP 0 산출물. 5개 앱 + 허브/대시보드/shared 가 반드시 공유하는 불변식·경계·설정.
> 아키텍처 전체는 [ARCHITECTURE.md](./ARCHITECTURE.md).

## 1. 절대 불변식 (구현 중 어기지 않는다)

1. **포인트(`users.balance`) 증가는 검증된 경로로만.** 인플레 차단이 시스템의 존재 이유.
   - 베팅: 참가자는 감소만, 증가는 운영자/규칙 검증
   - 주식·DP·저지·보드: 모든 증감은 Cloud Functions(Admin SDK)만. 신규 UI도 함수 경유
2. **`firestore.rules`는 단일 권위 파일.** 앱별로 갈라 쓰지 않는다. 권위본 = `HK_Stock/firestore.rules`(상위집합). 변경 시 통합본 갱신 후 배포.
3. **함수 codebase 경계 유지.**
   - `default` = `HK_Stock/functions` → 주식 + 보드(gigs/help) + DP
   - `judge` = `HK_Judge/functions` → 저지 전용
   - 베팅 = 함수 없이 규칙-only
4. **admin 게이트 일원화.** `VITE_ADMIN_EMAILS`(env) + 규칙 `isAdmin()` 한 소스. 현재 `jetsomk22@gmail.com`.
5. **운영 PM은 툴 화이트리스트 밖 행동 불가.** 임의 Firestore 쓰기 금지, 되돌리기 어려운 액션은 사전 확인 + 감사 로그.
6. **비파괴 마이그레이션.** 기존 5개 배포는 흡수 완료 전까지 살아있게. STEP은 독립 배포·롤백 가능.

## 2. 공유 백엔드 (기존, 무변경)

- Firebase 프로젝트: **`hk-chess-betting`** (단일 Firestore, 5앱 공유)
- 신분·지갑: `users/{id} = { name, pinHash, balance }` — balance = 공유 포인트, 로그인 name+PIN 공통

### 컬렉션 지도
```
users/{id}                     공유 지갑·신분
meta/{docId}                   보드 설정 (betting board, stockBoard, dpExchange)
markets/{id}/bets/{userId}     베팅
stocks/ holdings/ trades/ ledger/ stockTraits/ scheduledNews/   주식
dpAccounts/ dpGoods/ dpRedemptions/                             DP
problems/ problemTests/ submissions/ solved/                    저지
gigs/ helpRequests/                                             보드(외주/봉사)
```

### housePool 공유
주식·DP·저지·봉사 4앱이 하우스풀을 공유. 적자 분석 시 **전 ledger type 집계 필수**(단일 앱만 보면 틀림). 감사 로직 = `audit_house.mjs`.

## 3. DP 환산 파라미터 (예산 편성)

- **포인트 → DP**: 본드커브 `i번째 DP = R0 + k·i^exp`. 확정 **R0=10,000 · k=1,000 · exp=2**(2차). 주간 리셋, 단방향(DP→포인트 매도 없음). 코드: `dpcurve.js`(`src/domain` ↔ `functions` 바이트 동일 유지).
- **DP → 현금**: **기준 500원/DP.** 시세 변동 가능 → `meta/dpExchange.krwPerDp`(기본 500) 단일 소스로 관리.
- **이벤트성 제외**: 치킨 등 이벤트 현물은 `dpGoods.event: true` 로 표시, 균일 500원 환산에서 제외하고 별도 '이벤트 예산'.
- 예산 체인: `유통포인트 → (곡선) → DP → (×krwPerDp) → 현금`.

> 신규 필드(STEP에서 추가): `meta/dpExchange.krwPerDp`(=500), `dpGoods.event`(boolean).

## 4. 프론트 공통 (통합 대상)

- 스택: React 18 + Vite 5 + firebase ^10.14.1
- 복붙 통합 대상 → `packages/shared`: `firebase.js`, `auth/`, wallet 구독, callable 래퍼, UI킷
- 디자인 토큰: 루트 `DESIGN-SYSTEM-PROMPT.md`
- 배포: 각 앱 GitHub Pages(`build:ghpages`, `DEPLOY_TARGET=ghpages`). 흡수 후 허브 단일 배포로 수렴.
