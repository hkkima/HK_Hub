// 5개 앱 런처 정의 — 허브는 흡수하지 않고 각 라이브 사이트로 링크만 건다.
export const APPS = [
  { key: 'stock',   name: '주식판',   emoji: '📈', url: 'https://hkkima.github.io/HK_Stock/',   desc: 'AMM 시세 · 배당' },
  { key: 'betting', name: '베팅판',   emoji: '🎲', url: 'https://hkkima.github.io/HK_Betting/', desc: '패리뮤추얼 베팅' },
  { key: 'board',   name: '외주게시판', emoji: '🤝', url: 'https://hkkima.github.io/HK_Board/',  desc: '의뢰 · 봉사' },
  { key: 'judge',   name: '코딩문제',  emoji: '⚖️', url: 'https://hkkima.github.io/HK_Judge/',   desc: 'C# 풀이 · 보상' },
  { key: 'dp',      name: 'DP 교환소', emoji: '🎁', url: 'https://hkkima.github.io/HK_DP/',      desc: '포인트 → DP → 현물' },
];
