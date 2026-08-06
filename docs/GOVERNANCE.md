# HK 통합 거버넌스 — 모든 기준과 규칙은 Hub 로 (2026-08-06)

> 이 문서가 HK 프로젝트군(8개 리포, 공유 Firebase `hk-chess-betting`)의 **크로스-리포 기준의 정본**이다.
> 각 리포의 README/CLAUDE.md 는 이 문서와 `CONVENTIONS.md` 를 가리키는 포인터만 남긴다.
> 개별 리포 문서와 이 문서가 충돌하면 **이 문서가 이긴다** — 그리고 충돌을 발견한 사람이 이 문서에 맞춰 그쪽을 고친다.

## 0. 왜

- 2026-08-04 규칙 배포 사고 2연발(각 리포가 자기 사본을 배포 → 마지막 배포가 나머지 앱 규칙을 삭제).
- 운영 기능(P 지급은 Betting, DP 지급은 DP…)이 앱별로 흩어져 운영 부담 분산 + 회계 기록 누락.
- "권위본" 주장 문서가 4곳에서 서로 모순(감사 결과: HK_Stock 판은 상위집합이 아니었다 — 게임허브 6블록·카지노 6블록 누락).

## 1. Firestore 규칙 — 권위는 ★라이브★, 절차는 3단계, 도구는 Hub

1. **권위본은 리포의 어떤 파일도 아니다. 라이브 룰셋이 권위다.**
   어느 리포 사본도 전체본이 아니었던 것이 8-04 사고의 뿌리다. "내 리포의 rules 가 최신"이라는
   전제를 버려라 — 그 전제가 참인 순간은 배포 직후 몇 분뿐이다.
2. **규칙 배포는 반드시 3단계.** 도구 정본 = `HK_Hub/tools/rules/`(HK_Gamble 판을 승격, 조각 경로를 CWD 기준으로 수정):
   ```bash
   node <HK_Hub>/tools/rules/check-live-rules.mjs --save live.rules     # ① 기준은 라이브
   node <HK_Hub>/tools/rules/merge-rules.mjs live.rules merged.rules \
        --fragment firestore.rules.<label> --label <label>              # ② 내 조각만 삽입
   node <HK_Hub>/tools/rules/deploy-rules.mjs merged.rules --confirm    # ③ match 소실 시 거부
   ```
3. **각 앱은 전체본이 아니라 조각(`firestore.rules.<label>`)만 리포에 둔다.**
   현재 조각 모델을 지키는 앱은 HK_Gamble(`firestore.rules.casino`)뿐이다. HK_Betting·HK_Judge·
   HK_Stock·HK_GameHub 의 전체본 `firestore.rules` 는 **자기 블록만 남긴 조각으로 전환**하는 것이 목표 상태.
4. **`firebase.json` 에 `firestore.rules` 키를 두지 마라.** 키가 있으면 무필터 `firebase deploy` 한 번이
   3단계 절차를 우회해 다른 앱 규칙을 지운다(현재 Betting·Judge·Stock·GameHub 4곳이 위험 — 전환 대상).
   HK_Gamble 처럼 `indexes` 만 남기는 것이 표준이다.
5. **CI/Actions 에서 규칙 배포 금지.** `HK_Gamble/.github/workflows/deploy-backend.yml` 의
   `*rules*) exit 1` 게이트 패턴을 표준으로 한다. (HK_GameHub 워크플로의 `deploy-rules` 옵션은 제거 대상.)

## 2. 운영(지급·조정) 창구는 Hub 하나

| 기능 | 창구 | 서버 경로 | 원장 |
|---|---|---|---|
| P 지급/조정(개인·전원) | **Hub 관리자** | `grantPoints`(HK_Stock functions, housePool 상계) | `admin_grant` |
| DP 지급/회수 | **Hub 관리자** | `grantDP` | `dp_grant` |
| 팀 금고 충전 | **Hub 관리자** | `grantTeamPoints` | `teamLedger` |
| 교환소 주문 승인/거부 | **Hub 관리자** | `fulfillCorpOrder`/`rejectCorpOrder` | `corpOrders` |
| 상장·대표 지정 | HK_Stock 관리자(예외 — 시장 구조 조작이라 시장 앱에 남긴다) | `upsertStock` | — |

원칙: **`users.balance` 를 움직이는 신규 운영 UI 는 Hub 에만 만든다.** 각 앱 관리자 화면은
자기 도메인 운영(문제 출제, 마켓 개설, 상품 관리 등)만 갖는다. 클라이언트 직접 쓰기(updateDoc 등)로
잔고를 움직이는 코드는 발견 즉시 결함으로 취급한다(불변식 1).

## 3. 각 리포의 의무

1. **README(있으면 CLAUDE.md 도) 상단에 Hub 포인터 블록**을 둔다:
   > 크로스-리포 기준·규칙·배포 절차의 정본은 **HK_Hub `docs/GOVERNANCE.md` · `docs/CONVENTIONS.md`** 다.
   > 이 리포의 문서와 충돌하면 Hub 문서가 이긴다. 규칙 배포는 반드시 Hub 3단계 절차로.
2. 자기 문서에 **다른 앱을 지울 수 있는 배포 명령을 남기지 않는다**
   (`firebase deploy --only firestore:rules`, 무필터 `firebase deploy` 등 — 발견 즉시 삭제·교체).
3. 새 컬렉션·ledger type·codebase 를 추가하면 **같은 PR 에서** `CONVENTIONS.md`(컬렉션 지도·보존집합)와
   `HK_Stock/test-harness/audit_house.mjs`(type 분해)를 갱신한다. 나중은 없다 — 감사에서 15종이 밀린 전례.
4. 배포본과 리포가 갈라지는 작업(콘솔 직접 배포, 임시 함수)은 금지. 라이브에만 존재하는 코드가
   grantDP 6종·홀덤 클라이언트 두 건이나 나왔다 — 재배포 한 번에 라이브 기능이 삭제되는 시한폭탄이다.

## 4. 문서 지도 (Hub 가 정본인 것들)

| 문서 | 내용 |
|---|---|
| `docs/GOVERNANCE.md` (이 문서) | 거버넌스 헌장 — 권위 소재·배포 절차·창구 일원화 |
| `docs/CONVENTIONS.md` | 불변식·컬렉션 지도·보존집합·codebase 경계 |
| `docs/PLAN-GRANT-CONSOLIDATION.md` | 지급 기능 Hub 통합 계획(0~3단계) |
| `docs/AUDIT-2026-08-06.md` | 전체 교차 감사 보고서(규칙·회계·드리프트) |
| `packages/shared/src/auth.js` | PIN 해시 정본(골든 테스트 동결) |
| `tools/rules/` | 규칙 병합·검증·배포 3종 도구 정본 |

개별 앱 문서(HANDBOOK, INTEGRATION, CASINO-ECONOMY 등)는 **자기 도메인 상세**만 다룬다.
크로스-리포 규칙을 새로 만들 일이 생기면 그 앱 문서가 아니라 **여기에** 쓴다.
