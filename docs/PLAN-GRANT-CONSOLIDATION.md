# 계획 — DP/P 지급 기능 Hub 통합 (2026-08-06)

운영자 지급 기능이 앱별 관리자 화면에 흩어져 있어 운영 부담이 분산된다. 이 문서는 그중
**HK_DP 의 DP 지급**과 **HK_Betting 의 P 지급**을 HK_Hub 관리자 화면 한 곳으로 모으는 계획이다.
(서버는 그대로 `hk-chess-betting` 공유 프로젝트 — 옮기는 것은 **UI 와 진입점**이지 함수가 아니다.
Hub 는 GitHub Pages 프론트 전용이고 functions 코드베이스가 없으며, 새로 만들 이유도 없다.)

## 현황 진단

| 지급 기능 | 현재 위치 | 구현 방식 | 문제 |
|---|---|---|---|
| DP 지급 (`grantDP`, 일괄·음수 회수) | HK_DP AdminPage | 콜러블 (서버 권위) | UI 위치만 문제. 단, ★서버 소스 유실★(아래) |
| P 개인 지급 (`grantPoints`) | HK_Betting AdminPage | ★클라 직접 쓰기★ (`updateDoc` increment) | 원장(ledger) 기록 없음 · housePool 상계 없음(무기록 발행) · "포인트 증감은 함수만" 불변식 위반(최고참 앱이라 남은 유산) |
| P 전원 지급 (`grantAllPoints`) | HK_Betting AdminPage | ★클라 writeBatch★ | 위와 동일 + 400건 배치 중단 시 부분 적용 |
| 팀 금고 충전 (`grantTeamPoints`) | HK_Hub AdminPage | 콜러블 | 이미 Hub 에 있음 — 통합의 착지점 증명 |

**★중대 발견 — `grantDP` 계열 서버 소스가 로컬 어느 리포에도 없다.★**
설계문서(`HK_Stock/docs/DP-EXCHANGE-DESIGN.md`)는 HK_Stock `functions/index.js` 에 넣기로 했고
커밋 23ea177 메시지도 함수 추가를 주장하지만, 실제 그 커밋과 현재 HEAD 어디에도
`grantDP`/`convertToDP`/`redeemGoods`/`upsertGoods`/`fulfillRedemption`/`setDpParams` 정의가 없다.
라이브에는 배포되어 돌고 있으므로(교환소 작동 중) **배포본과 리포가 갈라진 상태**다.
어떤 함수 재배포든 이 함수들을 지워버릴 수 있다 — 통합 이전에 반드시 회수해야 한다.

## 목표 상태

- 운영자는 **Hub 관리자 화면 한 곳**에서: P 지급/조정(개인·전원) · DP 지급(일괄·회수) · 팀 금고 충전(기존).
- 모든 지급이 **콜러블 경유** + **ledger 기록** + **housePool 상계**(총량보존 집합 안에서 이동).
- Betting/DP 관리자 화면의 지급 섹션은 제거하고 Hub 링크로 대체.
- `users.balance` 에 대한 클라이언트 쓰기 권한(운영자 포함)을 규칙에서 완전히 제거.

## 단계

### 0단계 — `grantDP` 계열 소스 회수 ★선행 필수★
1. `gcloud functions describe` / Firebase 콘솔에서 배포된 소스 아카이브를 내려받아 정본 확보.
   (불가하면 DP-EXCHANGE-DESIGN.md §6 의 코드 그대로 재구현 — 설계문서에 전문이 있다.)
2. HK_Stock `functions/index.js`(codebase `default`)에 편입, `dpcurve.js` import 연결.
3. 배포 전 라이브 함수 목록과 대조(`firebase functions:list`) — 이름·리전 일치 확인 후 재배포.
   검증: HK_DP 화면에서 교환·지급 왕복 1회.

### 1단계 — P 지급을 서버 권위로 (신규 콜러블)
1. HK_Stock functions 에 `grantPoints`(운영자: `{ userIds|'all', delta, memo }`) 추가.
   회계: `users.balance += delta` ↔ `meta/stockBoard.housePool -= delta` (둘 다 `FieldValue.increment`),
   `ledger` type `admin_grant` 기록. 전원 지급도 서버에서 배치(부분 실패 시 재시도 멱등키).
   ※ 순발행이 필요하면 기존 `mintToHouse` 로 하우스를 먼저 채우는 2단 절차를 운영 규범으로.
2. `test-harness/audit_house.mjs` 분해 항목에 `admin_grant` 반영.

### 2단계 — Hub UI 통합
1. HK_Hub AdminPage 에 섹션 추가: **P 지급/조정**(개인 검색·전원, 음수 허용) · **DP 지급**(대상 다중 선택·memo).
   콜러블 래퍼는 `apps/hub/src/data.js` 에(기존 `grantTeamPoints` 패턴 그대로, Google 운영자 인증 재사용).
2. 지급 이력 열람(ledger `admin_grant` · `dpLedger`) 테이블 추가 — 분산돼 있던 "지급했는지 확인" 부담까지 회수.

### 3단계 — 구 화면 철거 + 권한 회수
1. HK_Betting AdminPage 의 지급 UI 제거(Hub 링크로 대체), `store.js` 의 클라 직접 쓰기 함수 삭제.
2. HK_DP AdminPage 의 "① 이벤트 DP 지급" 섹션 제거(상품·납품 관리는 잔류 — 별도 통합 후보).
3. `firestore.rules` 에서 운영자 클라이언트의 `users.balance` 쓰기 허용 제거.
   ★규칙 배포는 반드시 3단계 절차★(2026-08-04 사고 재발 방지):
   `check-live-rules.mjs --save live.rules` → `merge-rules.mjs` → `deploy-rules.mjs --confirm`.

### 검증·롤백
- 각 단계 후 `audit_house.mjs` 로 총량보존 분해 확인. 1~2단계는 구 UI 와 병행 기간을 두고,
  Hub 경로가 1주 무사고면 3단계 진행. 롤백 = Hub 섹션 숨김 + 구 UI 복원(규칙 회수 전까지는 즉시 가능).

## 리스크

- **0단계를 건너뛰고 함수를 배포하면 라이브 DP 교환소가 통째로 내려간다** — 이 계획의 유일한 하드 블로커.
- 규칙 배포 사고(공유 프로젝트 규칙 파일 1개) — 위 3단계 절차 강제.
- Betting 클라 쓰기 제거 시 다른 화면이 같은 경로를 쓰는지 사전 grep 필요(`updateDoc(userRef` 전수).
