// 5개 앱 런처 정의 — 허브는 흡수하지 않고 각 라이브 사이트로 링크만 건다.
// color = 각 앱(홀)의 HK-UI 테마 고유 accent. 허브(네이비)는 중립이라, 홀들이 자기 색으로
//         디렉토리에 정렬된다 → 허브가 '5색의 목차'가 된다(통합감 장치).
export const APPS = [
  { key: 'stock',   name: '증권가',   sub: '주식판',   color: '#ff2d6b', url: 'https://hkkima.github.io/HK_Stock/',   desc: 'AMM 시세 · 배당' },
  { key: 'betting', name: '베팅판',   sub: '베팅',     color: '#e0951f', url: 'https://hkkima.github.io/HK_Betting/', desc: '패리뮤추얼 베팅' },
  { key: 'board',   name: '의뢰소',   sub: '외주게시판', color: '#9c1f1a', url: 'https://hkkima.github.io/HK_Board/',  desc: '의뢰 · 봉사' },
  { key: 'judge',   name: '심판소',   sub: '코딩문제',  color: '#7c2b23', url: 'https://hkkima.github.io/HK_Judge/',   desc: 'C# 풀이 · 보상' },
  { key: 'dp',      name: '교환소',   sub: 'DP',       color: '#12b886', url: 'https://hkkima.github.io/HK_DP/',      desc: '포인트 → DP → 현물' },
];
