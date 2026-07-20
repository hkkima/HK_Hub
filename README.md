# HK 통합 플랫폼 (HK_Hub)

수강생 포인트 경제(베팅·주식·저지·의뢰/보드·DP)의 **통합 진입점 + 운영 콘솔**.

라이브: **https://hkkima.github.io/HK_Hub/**

백엔드는 이미 통합돼 있다 — 5앱 전부 같은 Firebase `hk-chess-betting` / 단일 Firestore / 공유 `users` 지갑.
이 repo는 **허브(런처+대시보드)와 팀 경제 UI**를 담당한다. **각 앱은 흡수하지 않고 그대로 둔다.**

## 구조 (npm workspaces 모노레포)

```
HK_Hub/
├─ packages/shared/   @hk/shared — name+PIN 해시 정본(골든 테스트로 동결). 그 외는 just-in-time
├─ apps/hub/          허브 — 홈(순자산·의뢰) / 내 회사(CEO) / 관리(운영자)
└─ docs/
   ├─ ARCHITECTURE.md    3층 구조 · 예산 편성(포인트→DP→현금) · ⚠일부 로드맵 폐기됨
   ├─ CONVENTIONS.md     ★불변식·컬렉션 지도·팀=주식·사용자 조회 규칙★ (착수 전 필독)
   ├─ CORP-POINTS.md     팀 포인트 경제모델 + 구현 명세 + 2026-07-20 확정 결과
   ├─ RELISTING-RESET.md 재상장 하드리셋 절차서(집행 완료 기록 포함)
   └─ DESIGN-HUB.md      허브 디자인 「여권·중앙 발권국」
```

## 현재 상태

| 영역 | 상태 |
|---|---|
| 허브 — 로그인·순자산·의뢰/봉사·홀 디렉토리 | ✅ 라이브 |
| 허브 — 내 회사(주급·상여·자체배당·공개원장) | ✅ 라이브 |
| 허브 — 관리(팀 금고 충전·팀 현황, Google 운영자) | ✅ 라이브 |
| 팀 경제 함수 6종 (HK_Stock/functions) | ✅ 배포 |
| 재상장 하드리셋 | ✅ 2026-07-20 집행 완료 |
| **유상증자 `subscribeShares`** | ⏳ **설계만, 미구현** (CORP-POINTS §13) |
| 예산 편성 뷰(포인트→DP→현금) | ⏳ 미구현 |

## 핵심 규칙 (요약 — 상세는 CONVENTIONS.md)

- **팀 = 주식**: `stocks/{id}` 에 `ceoUserId`·`corpBalance`. 상장=팀 생성, 상폐=팀 해산
- **총량보존**: `Σ개인 + Σ금고 + Σreserve + housePool + Σescrow = 불변`. 잔고는 `increment` 로만
- **포인트 증가는 Cloud Functions 경유만**. `firestore.rules` 는 HK_Stock 이 진실원천
- **사용자 조회**: 문서 ID가 이름 슬러그가 아닐 수 있음 → name 폴백 + 세션엔 실제 문서 ID

## 개발

```bash
npm install                       # 워크스페이스 전체 설치
npm run dev:hub                   # 허브 개발 서버 (localhost:5400)
npm run test --workspace packages/shared   # PIN 해시 골든 테스트
```

배포는 `main` 푸시 → GitHub Actions (`apps/hub` 빌드 → Pages).
