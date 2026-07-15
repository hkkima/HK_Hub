import { useState, useEffect, useCallback } from 'react';
import { nameToUserId, verifyPin } from '@hk/shared';
import { isConfigured } from './firebase.js';
import { fetchUser, watchUser, watchDp, watchMyGigs, watchMyHoldings, watchStocks, watchMyHelp } from './data.js';
import { APPS } from './apps.js';

const SESSION_KEY = 'hkhub.session';

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
}

// 외주 상태 라벨(보드판과 동일 어휘).
const GIG_STATUS = {
  open: { label: '모집중', cls: 'st-open' },
  assigned: { label: '진행중', cls: 'st-go' },
  working: { label: '진행중', cls: 'st-go' },
  submitted: { label: '검수대기', cls: 'st-wait' },
  confirmed: { label: '완료', cls: 'st-done' },
  disputed: { label: '분쟁', cls: 'st-warn' },
  cancelled: { label: '취소', cls: 'st-mute' },
};

function gigRole(g, uid) {
  if (g.requesterId === uid) return '의뢰자';
  if (g.workerId === uid) return '작업자';
  if (Array.isArray(g.applicants) && g.applicants.includes(uid)) return '지원함';
  return '';
}

// 봉사 상태 라벨.
const HELP_STATUS = {
  open: { label: '모집중', cls: 'st-open' },
  approved: { label: '완료', cls: 'st-done' },
  closed: { label: '완료', cls: 'st-done' },
  rejected: { label: '반려', cls: 'st-warn' },
  cancelled: { label: '취소', cls: 'st-mute' },
};

function helpRole(h, uid) {
  if (h.requesterId === uid) return '요청자';
  if (Array.isArray(h.volunteers) && h.volunteers.includes(uid)) return '봉사자';
  return '';
}

// 주식 평가액 = Σ floor(shares) × price (HK_Stock/domain/market.js holdingValue와 동일).
function portfolioValue(holdings, stocks) {
  return holdings.reduce((sum, h) => sum + Math.floor(h.shares || 0) * (stocks[h.stockId]?.price || 0), 0);
}

export default function App() {
  const [session, setSession] = useState(loadSession);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }, []);

  const login = useCallback((s) => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  if (!isConfigured()) {
    return <Shell><p className="err">Firebase 설정이 없어요. <code>apps/hub/.env</code> 를 채워 주세요.</p></Shell>;
  }

  return session
    ? <Dashboard session={session} onLogout={logout} />
    : <Login onLogin={login} />;
}

function Shell({ children }) {
  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">🎯 HK 허브</div>
      </header>
      <main>{children}</main>
    </div>
  );
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
      if (!user) { setErr('등록되지 않은 이름이에요. 주식/베팅판에서 먼저 가입했는지 확인하세요.'); return; }
      if (!verifyPin(pin, user.pinHash)) { setErr('PIN이 맞지 않아요.'); return; }
      onLogin({ userId, name: user.name || name, pinHash: user.pinHash });
    } catch (e2) {
      setErr('로그인 처리 중 오류: ' + (e2?.message || e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <form className="card login" onSubmit={submit}>
        <h2>로그인</h2>
        <p className="muted">주식·베팅판과 같은 이름 + PIN으로 들어와요.</p>
        <label>이름</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="예: 김철수" />
        <label>PIN</label>
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="숫자 PIN" />
        {err && <p className="err">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? '확인 중…' : '들어가기'}</button>
      </form>
      <Launcher />
    </Shell>
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

  const activeGigs = gigs.filter((g) => !['confirmed', 'cancelled'].includes(g.status));
  const stockValue = portfolioValue(holdings, stocks);
  const netWorth = (balance || 0) + stockValue;

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">🎯 HK 허브</div>
        <div className="who">
          <span className="uname">{session.name}</span>
          <button className="ghost" onClick={onLogout}>로그아웃</button>
        </div>
      </header>
      <main>
        <section className="stats">
          <div className="stat">
            <div className="lab">포인트</div>
            <div className="num">{balance == null ? '…' : balance.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="lab">주식 평가액</div>
            <div className="num">{holdings.length === 0 ? '0' : stockValue.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="lab">DP</div>
            <div className="num accent2">{dp == null ? '…' : dp.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="lab">진행중 의뢰</div>
            <div className="num">{activeGigs.length}</div>
          </div>
        </section>
        <p className="networth">순자산(포인트+주식) <b>{balance == null ? '…' : netWorth.toLocaleString()}</b></p>

        <section className="block">
          <h3>내 의뢰 현황</h3>
          {gigs.length === 0 && <p className="muted">얽힌 외주가 없어요. <a href="https://hkkima.github.io/HK_Board/" target="_blank" rel="noreferrer">외주게시판</a>에서 시작해 보세요.</p>}
          {gigs.length > 0 && (
            <ul className="gigs">
              {gigs.map((g) => {
                const st = GIG_STATUS[g.status] || { label: g.status, cls: 'st-mute' };
                return (
                  <li key={g.id}>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    <span className="gtitle">{g.title || '(제목 없음)'}</span>
                    <span className="grole">{gigRole(g, session.userId)}</span>
                    <span className="greward">{(g.reward || 0).toLocaleString()} P</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {help.length > 0 && (
          <section className="block">
            <h3>내 봉사 현황</h3>
            <ul className="gigs">
              {help.map((h) => {
                const st = HELP_STATUS[h.status] || { label: h.status, cls: 'st-mute' };
                return (
                  <li key={h.id}>
                    <span className={`badge ${st.cls}`}>{st.label}</span>
                    <span className="gtitle">{h.title || '(제목 없음)'}</span>
                    <span className="grole">{helpRole(h, session.userId)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="block">
          <h3>바로가기</h3>
          <Launcher />
        </section>
      </main>
    </div>
  );
}

function Launcher() {
  return (
    <div className="launcher">
      {APPS.map((a) => (
        <a className="applink" key={a.key} href={a.url} target="_blank" rel="noreferrer">
          <span className="aemoji">{a.emoji}</span>
          <span className="ainfo">
            <span className="aname">{a.name}</span>
            <span className="adesc">{a.desc}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
