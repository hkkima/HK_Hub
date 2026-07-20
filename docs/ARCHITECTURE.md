# HK 통합 플랫폼 — 아키텍처 설계 문서

> ## ⚠️ 이 문서의 로드맵(§4)은 일부 폐기됨 — 현재 상태 요약
>
> 초기 계획은 인프라(공유 패키지 추출 → 앱 순차 흡수 → 단일 SPA)를 앞세웠으나,
> **"허브는 앱을 흡수하지 않는다"** 로 스코프가 교정됐다(2026-07-14).
>
> | 항목 | 계획 | **실제** |
> |---|---|---|
> | 패키지 매니저 | pnpm workspaces | **npm workspaces** |
> | 허브 성격 | 5앱을 흡수해 단일 SPA | **얇은 런처 + 공유데이터 대시보드**(각 앱은 그대로 별도 배포) |
> | STEP 6 앱 순차 흡수 | 예정 | **폐기** |
> | packages/shared | firebase·auth·wallet·UI킷 전부 | **auth만**(골든 테스트로 PIN 해시 동결). 나머지는 just-in-time |
>
> **현재 구축된 것**: `apps/hub`(여권 디자인 · 홈/내 회사/관리 3탭 · 라이브 배포),
> 팀 경제 함수 6종(주급·상여·배당·교환소·금고충전), HK_DP는 서브모듈로 `@hk/shared` 참조.
>
> 살아있는 설계: §2 진단 · §3 3층 구조 · §3.3 예산 편성(포인트→DP→현금).
> 팀 경제는 [CORP-POINTS.md](./CORP-POINTS.md), 재상장 절차는 [RELISTING-RESET.md](./RELISTING-RESET.md).

> 작성 2026-07-13 · 상태: **설계 확정용 초안** · 다음 단계: 이 문서 승인 후 로드맵 STEP 0부터 착수
>
> 결정 사항(확정):
> - 통합 프론트: **단계적** — 포털 허브 먼저 만들고 `packages/shared`를 뽑아가며 앱을 점진 흡수
> - Claude PM 대화창: **운영 PM + 개발 PM 둘 다**
> - 우선순위: **이 설계 문서부터 확정** → 이후 착수

---

## 1. 목표

수강생 대상 포인트 경제(베팅·주식·저지·의뢰/보드·DP)를 하나로 묶는다.

- **학생용**: 5개 앱을 한 진입점에서, 한 번 로그인으로, 일관된 헤더(잔액·이름)로 사용
- **운영자용**: 5개 앱의 운영 기능 + housePool 회계를 한 콘솔에서
- **PM**: Claude Code 대화창이 (a) 라이브 운영 명령을 실행하고 (b) 5개 코드베이스·로드맵을 조율

핵심 원칙: **라이브 운영 중이므로 무중단·비파괴 마이그레이션.** 백엔드/데이터 모델은 건드리지 않고 프론트 레이어부터 통합한다.

---

## 2. 현황 진단

### 2.1 이미 통합되어 있는 것 (백엔드) — 손대지 않는다

| 항목 | 실태 |
|---|---|
| Firebase 프로젝트 | **5앱 전부 `hk-chess-betting` 단일 프로젝트 / 단일 Firestore** 공유 |
| 신분·지갑 | `users/{id}` = `{ name, pinHash, balance }`. **balance가 공유 포인트**, 로그인도 name+PIN 공통 |
| 보안 규칙 | `firestore.rules` **단일 파일이 5앱 규칙의 권위 통합본**(HK_Stock 버전이 상위집합) |
| 권위 있는 포인트 증감 | **전부 Cloud Functions(Admin SDK)** 가 처리 → 규칙 우회. 클라는 대개 읽기 전용 |
| 관리자 게이트 | 이메일 화이트리스트 `VITE_ADMIN_EMAILS` / 규칙 `isAdmin()` (`jetsomk22@gmail.com`) |

**핵심 불변식 (절대 깨지 않는다):**
> 포인트(`users.balance`)는 검증된 경로로만 증가한다(인플레 차단).
> - 베팅: 참가자는 감소만(베팅), 증가(정산)는 운영자/규칙 검증
> - 주식·DP·저지·보드: 모든 증감은 Cloud Functions만

### 2.2 백엔드 함수 지형 — 이미 부분 통합됨

| 코드베이스 | 위치 | 담당 |
|---|---|---|
| **default** | `HK_Stock/functions/index.js` | **주식 + 보드(gigs/help) + DP** 를 한 파일에서 다 처리(35+ callable) |
| **judge** | `HK_Judge/functions/index.js` | 저지 전용(codebase 분리): `runCode`, `submitSolution`, `upsertProblem`, `deleteProblem` |
| (없음) | — | 베팅은 **함수 없이 규칙만**으로 동작 |

즉 `HK_Stock/functions`가 사실상 **공유 백엔드 서비스**다. `HK_Board`·`HK_DP`는 자기 함수를 배포하지 않고 이 함수들을 호출한다.

주요 callable 인벤토리(운영 대시보드/운영 PM이 얹힐 표면):
- **주식**: `trade` `upsertStock` `delistStock` `payDividend` `grantOption` `adjustPrice` `marketReprice` `postNews` `postImpactNews` `postInstructorEvent(sBatch)` `scheduleNews` `cancelScheduledNews` `mintToHouse` `setAutoNews` `triggerNews`
- **스케줄(cron)**: `publishScheduledNews`(매분) `openMarket`(09:00) `closeMarket`(18:00) `marketTick`(장중) `autoNews`(30분)
- **보드-외주**: `postGig` `applyGig` `cancelApplication` `awardGig` `cancelGig` `reportGig` `confirmGig` `disputeGig` `resolveGig` `deleteGig`
- **보드-봉사**: `postHelp` `volunteerHelp` `cancelHelp` `approveHelp` `rejectHelp`
- **DP**: 교환/상품/정산(같은 codebase, 본드커브 `dpcurve.js`)
- **저지**: `runCode` `submitSolution` `upsertProblem` `deleteProblem`

### 2.3 파편화되어 있는 것 (통합 대상) — 프론트

| 항목 | 실태 | 문제 |
|---|---|---|
| 배포 | 5개 별도 git repo · 5개 Vite 빌드 · 5개 GitHub Pages | 진입점·URL 제각각 |
| 로그인/헤더 | `src/auth`, `src/data/firebase.js`, `src/data/store.js`, `src/styles` 가 **5벌 복붙** | 로그인·잔액표시·룩앤필 불일치, 수정 시 5곳 |
| 관리 화면 | 각 앱 `AdminPage.jsx`에 흩어짐 + `audit_house.mjs` 같은 스크립트 | 크로스앱 운영/회계 뷰 없음 |
| housePool 회계 | 주식·DP·저지·봉사 **4앱이 공유**하는데 통합 뷰 없음 | 적자 분석 시 전 ledger type 수동 집계 |

### 2.4 컬렉션 지도

```
users/{id}                     ← 공유 지갑·신분 (name, pinHash, balance)
meta/{docId}                   ← 보드 설정 (betting board, stockBoard, dpExchange)
markets/{id}/bets/{userId}     ← 베팅
stocks/ holdings/ trades/ ledger/ stockTraits/ scheduledNews/   ← 주식
dpAccounts/ dpGoods/ dpRedemptions/                             ← DP
problems/ problemTests/ submissions/ solved/                    ← 저지
gigs/ helpRequests/                                             ← 보드(외주/봉사)
```

---

## 3. 목표 아키텍처 (3층)

```
┌────────────────────────────────────────────────────────────┐
│  Claude PM 대화창  ── 운영 PM(라이브 명령 실행) + 개발 PM(조율)  │  ← 3층
├────────────────────────────────────────────────────────────┤
│  관리 대시보드  ── 운영자 전용(admin email), 크로스앱 + 회계뷰  │  ← 2층
├────────────────────────────────────────────────────────────┤
│  통합 프론트 "허브"  ── 학생용 단일 진입 · 공유 로그인/헤더      │  ← 1층
├────────────────────────────────────────────────────────────┤
│  packages/shared  ── firebase / auth / wallet / UI킷 (공용)   │  ← 공통 토대
├────────────────────────────────────────────────────────────┤
│  공유 백엔드 (기존, 무변경)  ── Firestore + Cloud Functions     │  ← 완성됨
└────────────────────────────────────────────────────────────┘
```

### 3.1 `packages/shared` — 통합의 토대

5앱에서 복붙된 것을 하나로 추출. 단계적으로 뽑아 각 앱이 하나씩 의존을 바꾼다.

- `firebase.js` — 앱 초기화, `isAdmin` 판정, callable 래퍼
- `auth/` — name+PIN 로그인·세션(현재 5벌 동일)
- `wallet` — `users/{id}` 구독, 잔액 컨텍스트(헤더 공용)
- `ui/` — 헤더, 로그인 카드, 버튼·토스트 등 룩앤필 토큰(참고: `DESIGN-SYSTEM-PROMPT.md`)
- `callables.ts` — 위 2.2 함수들의 타입드 클라이언트(운영 대시보드/PM이 공유)

### 3.2 1층 — 통합 프론트 "허브" (학생용)

**단계적 방식(확정):** 먼저 얇은 포털을 만들고, 기존 5앱은 그대로 두되 아래를 공유시킨다.

- **단일 로그인**: 허브에서 name+PIN 로그인 → 세션을 5앱이 공유(같은 Firebase Auth/로컬세션 규약)
- **공통 헤더**: 이름·잔액(users 구독)·앱 스위처
- **앱 스위처**: 베팅/주식/저지/의뢰/DP 카드. 초기엔 기존 배포 URL로 링크, 이후 라우트로 흡수
- **점진 흡수**: 앱을 하나씩 `packages/shared` 의존으로 바꾸고 허브 라우트(`/stock`, `/betting`…)로 이동. 다 옮기면 단일 SPA가 됨(빅뱅 없이 도달)

### 3.3 2층 — 관리 대시보드 (운영자 전용)

`isAdmin` 게이트. 대부분 **callable 함수 위의 UI + Firestore 읽기**라 백엔드 신설 거의 없음.

- **사용자**: 명단·잔액·PIN 리셋·생성/삭제, 원장(ledger) 조회
- **housePool 회계 뷰** ⭐: 주식·DP·저지·봉사 **전 ledger type 집계**로 하우스풀 잔고·적자 분석 한 화면. 기존 `audit_house.mjs` 로직을 UI로. (참고: 하우스풀 공유 회계 메모)
- **예산 편성 (포인트 → DP → 현금)** ⭐⭐: 유통 중인 포인트가 최종적으로 지게 되는 **현금 부채/예산 소요액**을 환산 체인으로 계산하는 도구.
  - **1단 포인트→DP**: DP 본드커브(`i번째 DP = R0 + k·i^exp`, 확정 R0=10,000·k=1,000·지수2, 주간 리셋·단방향)를 기준으로, 유통 포인트 총량이 환산 가능한 **DP 규모**를 산출. 곡선이 2차라 몰아사기를 징벌하므로, 실효 환산율(1인 주간 매수 패턴 가정)과 상한(전량 소진 가정) **두 시나리오를 함께** 제시.
  - **2단 DP→현금**: **DP당 현금 기준값 = 500원** (확정 기준값, 시세에 따라 변동 가능 → 운영자가 조정하는 파라미터). `meta/dpExchange`에 `krwPerDp`(기본 500) 필드를 추가해 단일 소스로 둔다.
    - ⚠ **이벤트성 상품 제외**: 치킨 등 이벤트성 현물(`dpGoods`에 `event: true` 플래그)은 이 균일 500원/DP 환산에서 **빼고**, 별도 '이벤트 예산'으로 따로 편성. 정규 예산이 이벤트 경품 때문에 과대 계상되지 않게 한다.
  - **산출**: `유통포인트 → (곡선 환산율) → DP → (×500원) → 현금`. 비례 계산으로 **예산 편성표**(총 유통 포인트·환산 DP·필요 현금, 낙관/보수 시나리오)를 만들고, 운영자가 `krwPerDp`·재고·이벤트 예산을 조정하면 실시간 재계산.
  - **용도**: "지금 뿌린 포인트가 현금으로 얼마인가"를 근거로 현물 상품 발주·현금 예산을 편성. housePool 적자 뷰와 연동(적자 시 예산 압박 경고).
- **앱별 운영 패널**:
  - 베팅: 마켓 개설/정산
  - 주식: 뉴스 예약/발행·시세조정·배당·틱·상장/폐지·`mintToHouse`
  - 저지: 출제(`upsertProblem`)·`problemTests` 관리·제출 감사
  - 보드: gig/봉사 승인·분쟁 해결(`resolveGig`·`approveHelp`)
  - DP: 상품·교환·정산 승인, 본드커브 파라미터
- **감사 로그**: 운영 액션 이력(누가 언제 무엇을)

### 3.4 3층 — Claude PM 대화창 (운영 + 개발 둘 다)

두 역할을 **분리된 컨텍스트**로 둔다.

**(a) 운영 PM — 대시보드 내 에이전트 콘솔**
- 자연어 운영: "이번 라운드 정산해줘", "주식 뉴스 하나 내보내줘", "○○ 봉사 승인"
- 실행 표면 = 2.2 callable 함수들을 감싼 **MCP 툴 / 함수 화이트리스트**. LLM은 툴만 호출, 권위 증감은 여전히 함수가 검증
- 안전장치: 금액·정산 등 되돌리기 어려운 액션은 **실행 전 확인**, 감사 로그 기록, admin 세션에서만
- 초기 형태: 대시보드 사이드패널 채팅(간단) → 이후 전용 오케스트레이션

**(b) 개발 PM — 멀티repo 조율 브레인**
- 5개 repo + 허브/대시보드/shared의 로드맵·작업 분배·진행 추적
- 지금 이 Claude Code 세션의 상설화: 크로스repo `CLAUDE.md`/컨텍스트, 공유 불변식(§2.1) 가드레일
- 산출물: 이 문서, 로드맵, 각 STEP의 작업 티켓

---

## 4. 단계적 로드맵 (무중단)

| STEP | 내용 | 리스크 | 산출물 |
|---|---|---|---|
| **0** | 이 설계 문서 확정 + `HK_Hub` repo 초기화, 크로스repo 규약(불변식·admin·컬렉션) 문서화 | 없음 | 승인된 ARCHITECTURE.md |
| **1** | `packages/shared` 추출(먼저 `firebase`+`auth`+`wallet`). 한 앱(주식)만 시범 의존 전환 | 낮음 | shared v0, 주식 회귀 통과 |
| **2** | **관리 대시보드 v1** — 사용자 관리 + housePool 회계 뷰(읽기 위주) | 낮음(읽기) | admin.앱 배포 |
| **3** | 대시보드에 앱별 운영 패널(callable 래핑) 추가 | 중(쓰기) | 운영자 콘솔 |
| **4** | **허브 포털** — 단일 로그인 + 헤더 + 앱 스위처(기존 URL 링크) | 낮음 | hub 배포 |
| **5** | **운영 PM 콘솔** — 대시보드에 함수 화이트리스트 에이전트 + 확인/감사 | 중 | 운영 PM v1 |
| **6** | 앱 순차 흡수 — 각 앱을 shared 의존+허브 라우트로. 하나씩, 배포별 검증 | 앱당 중 | 단일 SPA 수렴 |
| **∞** | 개발 PM 상설 컨텍스트 유지, 로드맵 갱신 | — | — |

각 STEP은 독립 배포·독립 롤백 가능하게. STEP 6은 앱 단위로 쪼개 언제든 멈춰도 됨.

---

## 5. 불변식 & 가드레일 (구현 중 절대 준수)

1. **포인트 증가는 검증된 경로만** — 클라 직접 balance 증가 금지(규칙이 이미 차단). 신규 UI도 함수 경유
2. **firestore.rules는 단일 권위 파일** — 앱별로 갈라 쓰지 않는다. 변경 시 통합본 갱신 후 배포
3. **함수 codebase 경계 유지** — default(주식+보드+DP) / judge 분리 유지. 베팅은 규칙-only
4. **admin 게이트 일원화** — `VITE_ADMIN_EMAILS` + `isAdmin()` 한 소스
5. **운영 PM은 툴 화이트리스트 밖 행동 불가** — 임의 Firestore 쓰기 금지, 되돌리기 어려운 액션은 사전 확인
6. **비파괴 마이그레이션** — 기존 배포는 흡수 완료 전까지 살아있게

---

## 6. 열린 결정 (STEP 0에서 확정 필요)

- **repo 전략**: `HK_Hub` 단일 신규 repo에 `packages/shared`+`apps/hub`+`apps/admin`을 두고, 기존 5repo를 순차 이관? 아니면 기존 repo 유지하고 shared만 npm/서브모듈로 공유? → **모노레포 신규 repo** 권장(pnpm workspaces)
- **세션 공유 방식**: 현재 name+PIN 세션을 서브도메인/경로 간 어떻게 공유(로컬스토리지 규약 vs Firebase Auth 커스텀토큰)
- **배포 도메인**: GitHub Pages 유지(경로 분리) vs 커스텀 도메인 서브패스(`/hub`, `/admin`)
- **운영 PM 실행 위치**: 브라우저 내 대화(함수 직접 호출) vs 별도 에이전트 백엔드(MCP 서버)
- **DP 로드맵 연동**: 본드커브 교환소·까미 자동거래·뉴스 자동화(기존 로드맵 메모)와 대시보드 통합 시점

---

## 7. 참고

- 공유 규칙 권위본: `HK_Stock/firestore.rules`
- 공유 함수: `HK_Stock/functions/index.js` (default), `HK_Judge/functions/index.js` (judge)
- 회계 감사 스크립트: `audit_house.mjs` (housePool 적자 분석 → 대시보드로 이식)
- 디자인 토큰: `DESIGN-SYSTEM-PROMPT.md`
- 관련 프로젝트 메모: HK_Stock / HK_Betting / HK_Board / HK_DP / HK_Judge, 하우스풀 공유 회계, HK_Stock 차기 로드맵
