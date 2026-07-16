import { useState, useEffect, useCallback } from 'react';
import { nameToUserId, verifyPin } from '@hk/shared';
import { isConfigured } from './firebase.js';
import { fetchUser, watchUser, watchDp, watchMyGigs, watchMyHoldings, watchStocks, watchMyHelp } from './data.js';
import { APPS } from './apps.js';

const SESSION_KEY = 'hkhub.session';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
}

const GIG_STATUS = {
  open: { label: '모집중', cls: 's-open' },
  assigned: { label: '진행중', cls: 's-go' },
  working: { label: '진행중', cls: 's-go' },
  submitted: { label: '검수대기', cls: 's-warn' },
  confirmed: { label: '완료', cls: 's-done' },
  disputed: { label: '분쟁', cls: 's-warn' },
  cancelled: { label: '취소', cls: 's-mute' },
};
const HELP_STATUS = {
  open: { label: '모집중', cls: 's-open' },
  approved: { label: '완료', cls: 's-done' },
  closed: { label: '완료', cls: 's-done' },
  rejected: { label: '반려', cls: 's-warn' },
  cancelled: { label: '취소', cls: 's-mute' },
};

function gigRole(g, uid) {
  if (g.requesterId === uid) return '의뢰자';
  if (g.workerId === uid) return '작업자';
  if (Array.isArray(g.applicants) && g.applicants.includes(uid)) return '지원';
  return '';
}
function helpRole(h, uid) {
  if (h.requesterId === uid) return '요청자';
  if (Array.isArray(h.volunteers) && h.volunteers.includes(uid)) return '봉사자';
  return '';
}
function portfolioValue(holdings, stocks) {
  return holdings.reduce((s, h) => s + Math.floor(h.shares || 0) * (stocks[h.stockId]?.price || 0), 0);
}

// 관인(official seal) — 2겹 원 + 별 + HK.
function Seal({ size = 46 }) {
  const c = size / 2;
  return (
    <svg className="seal" width={size} height={size} viewBox="0 0 46 46" aria-hidden="true">
      <circle cx="23" cy="23" r="21" fill="none" stroke="var(--accent-2)" strokeWidth="2" />
      <circle cx="23" cy="23" r="16.5" fill="none" stroke="var(--accent-2)" strokeWidth="1" />
      <text x="23" y="28" textAnchor="middle" fontFamily="'Cinzel', serif" fontWeight="900" fontSize="14" fill="var(--accent-2)">HK</text>
      <text x="23" y="7.5" textAnchor="middle" fontSize="6" fill="var(--accent-2)">★</text>
    </svg>
  );
}

function Masthead({ session, onLogout }) {
  return (
    <header className="masthead">
      <Seal />
      <div className="mh-title">
        <div className="ko">HK · 여권</div>
        <div className="en">Central Bureau of Points</div>
      </div>
      {session && (
        <div className="mh-who">
          <span className="uname">{session.name}</span>
          <button className="ghost" onClick={onLogout}>여권 반납</button>
        </div>
      )}
    </header>
  );
}

export default function App() {
  const [session, setSession] = useState(loadSession);

  const logout = useCallback(() => { localStorage.removeItem(SESSION_KEY); setSession(null); }, []);
  const login = useCallback((s) => { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); setSession(s); }, []);

  if (!isConfigured()) {
    return (
      <div className="wrap"><Masthead />
        <p className="err">Firebase 설정이 없어요. <code>apps/hub/.env</code> 를 채워 주세요.</p>
      </div>
    );
  }
  return session
    ? <Dashboard session={session} onLogout={logout} />
    : <Login onLogin={login} />;
}

function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const userId = nameToUserId(name);
      if (!userId) { setErr('이름을 입력하세요.'); return; }
      const user = await fetchUser(userId);
      if (!user) { setErr('등록되지 않은 이름이에요. 증권가/베팅판에서 먼저 가입했는지 확인하세요.'); return; }
      if (!verifyPin(pin, user.pinHash)) { setErr('PIN이 맞지 않아요.'); return; }
      onLogin({ userId, name: user.name || name, pinHash: user.pinHash });
    } catch (e2) {
      setErr('로그인 처리 중 오류: ' + (e2?.message || e2));
    } finally { setBusy(false); }
  }

  return (
    <div className="wrap">
      <Masthead />
      <form className="card login" onSubmit={submit}>
        <h2>여권 제시</h2>
        <p className="muted">증권가·베팅판과 같은 이름 + PIN으로 입국해요.</p>
        <label>이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="예: 김철수" />
        <label>PIN</label>
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="숫자 PIN" />
        {err && <p className="err">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? '확인 중…' : '입국'}</button>
      </form>
      <div className="block">
        <h3>홀 디렉토리</h3>
        <Directory />
      </div>
    </div>
  );
}

function Dashboard({ session, onLogout }) {
  const [balance, setBalance] = useState(null);
  const [dp, setDp] = useState(null);
  const [gigs, setGigs] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [stocks, setStocks] = useState({});
  const [help, setHelp] = useState([]);

  useEffect(() => {
    const subs = [
      watchUser(session.userId, (u) => setBalance(u ? (u.balance || 0) : 0)),
      watchDp(session.userId, setDp),
      watchMyGigs(session.userId, setGigs),
      watchMyHoldings(session.userId, setHoldings),
      watchStocks(setStocks),
      watchMyHelp(session.userId, setHelp),
    ];
    return () => subs.forEach((u) => u());
  }, [session.userId]);

  const stockValue = portfolioValue(holdings, stocks);
  const netWorth = (balance || 0) + stockValue;
  const records = [
    ...gigs.map((g) => ({ id: 'g' + g.id, title: g.title, role: gigRole(g, session.userId), st: GIG_STATUS[g.status] || { label: g.status, cls: 's-mute' } })),
    ...help.map((h) => ({ id: 'h' + h.id, title: h.title, role: helpRole(h, session.userId), st: HELP_STATUS[h.status] || { label: h.status, cls: 's-mute' } })),
  ];

  return (
    <div className="wrap">
      <Masthead session={session} onLogout={onLogout} />

      <section className="ledger">
        <div className="cap">순자산 · Net Worth</div>
        <div className="net">{balance == null ? '…' : netWorth.toLocaleString()}</div>
        <div className="currencies">
          <div className="cur"><div className="lab">포인트</div><div className="val">{balance == null ? '…' : balance.toLocaleString()}</div></div>
          <div className="cur"><div className="lab">주식 평가액</div><div className="val">{holdings.length === 0 ? '0' : stockValue.toLocaleString()}</div></div>
          <div className="cur"><div className="lab">DP</div><div className="val gold">{dp == null ? '…' : dp.toLocaleString()}</div></div>
        </div>
      </section>

      <div className="cols">
        <div className="block">
          <h3>입국 기록 · 의뢰 · 봉사</h3>
          {records.length === 0
            ? <p className="emptyline">아직 기록이 없어요. 의뢰소에서 시작해 보세요.</p>
            : (
              <ul className="stamps">
                {records.map((r) => (
                  <li key={r.id}>
                    <span className={`stamp ${r.st.cls}`}>{r.st.label}</span>
                    <span className="stitle">{r.title || '(제목 없음)'}</span>
                    <span className="srole">{r.role}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div className="block">
          <h3>홀 디렉토리</h3>
          <Directory />
        </div>
      </div>
    </div>
  );
}

function Directory() {
  return (
    <div className="directory">
      {APPS.map((a) => (
        <a className="hall" key={a.key} href={a.url} target="_blank" rel="noreferrer" style={{ '--hall': a.color }}>
          <span className="hall-seal">{a.name.slice(0, 1)}</span>
          <span className="hall-info">
            <span className="hall-name">{a.name}<span className="hall-desc"> · {a.sub}</span></span>
            <span className="hall-desc">{a.desc}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
