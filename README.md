# HK 통합 플랫폼 (HK_Hub)

수강생 포인트 경제(베팅·주식·저지·의뢰/보드·DP)를 하나로 묶는 통합 플랫폼.
**학생용 허브 + 운영자 관리 대시보드 + Claude PM(운영/개발)** 3층.

백엔드는 이미 통합돼 있다 — 5앱 전부 같은 Firebase `hk-chess-betting` / 단일 Firestore / 공유 `users` 지갑.
이 repo는 파편화된 **프론트 통합**과 **관리 콘솔 신설**을 담당한다. 백엔드/데이터 모델은 건드리지 않는다.

## 구조 (npm workspaces 모노레포)

```
HK_Hub/
├─ packages/
│  └─ shared/     @hk/shared — firebase/auth/wallet/callable/UI킷 (5앱 복붙 통합 대상)
├─ apps/
│  ├─ hub/        학생용 통합 진입 (STEP 4~)
│  └─ admin/      운영자 관리 대시보드 (STEP 2~)
└─ docs/
   ├─ ARCHITECTURE.md   3층 구조 · STEP 0~6 로드맵 · 예산 편성 설계
   └─ CONVENTIONS.md    불변식 · 컬렉션 지도 · DP 환산 파라미터
```

## 로드맵 요약

| STEP | 내용 |
|---|---|
| 0 ✅ | repo 초기화 + 크로스repo 규약 문서화 |
| 1 | `packages/shared` 추출(firebase+auth+wallet), 주식 앱 시범 전환 |
| 2 | 관리 대시보드 v1 — 사용자 관리 + housePool 회계 + **예산 편성(포인트→DP→현금)** |
| 3 | 대시보드 앱별 운영 패널(callable 래핑) |
| 4 | 허브 포털 — 단일 로그인 + 헤더 + 앱 스위처 |
| 5 | 운영 PM 콘솔 — 함수 화이트리스트 에이전트 |
| 6 | 앱 순차 흡수 → 단일 SPA 수렴 |

착수 전 필독: [docs/CONVENTIONS.md](docs/CONVENTIONS.md) (불변식).

## 개발

```bash
npm install          # 워크스페이스 전체 설치
npm run dev:hub      # 허브 개발 서버 (apps/hub 생성 후)
npm run dev:admin    # 관리 대시보드 개발 서버 (apps/admin 생성 후)
```
