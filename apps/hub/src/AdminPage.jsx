import { useState, useEffect } from 'react';
import { signInWithGoogle, watchAuth, isAdminEmail } from './firebase.js';
import { watchTeams, watchAllUsers, grantTeamPoints } from './data.js';

// ★팀 = 주식★ — 상장(팀 생성)·대표/팀원 지정은 HK_Stock 관리자 화면에서 한다(upsertStock).
//   여기서는 팀 금고(stocks.corpBalance) 충전과 현황만 다룬다.
export default function AdminPage() {
  const [gUser, setGUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const off = watchAuth(setGUser);
    const subs = [watchTeams(setTeams), watchAllUsers(setUsers)];
    return () => { off?.(); subs.forEach((u) => u()); };
  }, []);

  const isAdmin = gUser && !gUser.isAnonymous && isAdminEmail(gUser.email);
  const nameOf = (id) => users.find((u) => u.id === id)?.name || id;
  const [g, setG] = useState({ stockId: '', amount: '', memo: '', source: 'house' });

  async function run(fn, okText) {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg({ ok: true, text: okText(r) }); }
    catch (e) { setMsg({ ok: false, text: e.message || String(e) }); }
    finally { setBusy(false); }
  }

  if (!isAdmin) {
    return (
      <div className="block">
        <h3>관리자</h3>
        <p className="emptyline">
          운영자 Google 계정으로 로그인이 필요합니다.
          {gUser && !gUser.isAnonymous && ` (현재 ${gUser.email} — 운영자 아님)`}
        </p>
        <button className="primary" style={{ maxWidth: 240 }}
          onClick={() => run(() => signInWithGoogle(), (u) => `${u.email} 로그인됨`)}>
          Google로 운영자 로그인
        </button>
        {msg && <p className={msg.ok ? 'okline' : 'err'}>{msg.text}</p>}
      </div>
    );
  }

  return (
    <>
      <p className="muted">운영자 <b>{gUser.email}</b></p>
      {msg && <p className={msg.ok ? 'okline' : 'err'}>{msg.text}</p>}

      <section className="block">
        <h3>팀 금고 충전 (순위 배당 · 초기자본)</h3>
        <p className="muted" style={{ marginBottom: 10 }}>
          팀 = 상장 종목입니다. <b>상장·대표·팀원 지정은 HK_Stock 관리자</b>에서 하고, 여기서는 금고만 충전합니다.
        </p>
        <div className="formgrid">
          <select value={g.stockId} onChange={(e) => setG({ ...g, stockId: e.target.value })}>
            <option value="">팀(종목) 선택</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="number" placeholder="금액" value={g.amount} onChange={(e) => setG({ ...g, amount: e.target.value })} />
          <select value={g.source} onChange={(e) => setG({ ...g, source: e.target.value })}>
            <option value="house">housePool에서 (총량보존)</option>
            <option value="mint">신규 발행 (mint)</option>
          </select>
          <input placeholder="메모" value={g.memo} onChange={(e) => setG({ ...g, memo: e.target.value })} />
        </div>
        <button className="primary" disabled={busy || !g.stockId || !Number(g.amount)}
          onClick={() => run(
            () => grantTeamPoints({ stockId: g.stockId, amount: Math.floor(Number(g.amount)), memo: g.memo, source: g.source }),
            (r) => `${r.stockId} 금고 ${r.amount.toLocaleString()} 충전 (${r.source})`,
          ).then(() => setG({ ...g, amount: '', memo: '' }))}>
          충전
        </button>
      </section>

      <section className="block">
        <h3>팀 현황 ({teams.length})</h3>
        {teams.length === 0 && <p className="emptyline">상장된 팀이 없어요. HK_Stock 관리자에서 상장하세요.</p>}
        <ul className="stamps">
          {teams.map((t) => (
            <li key={t.id}>
              <span className={`badge ${t.ceoUserId ? 'st-go' : 'st-warn'}`}>{t.ceoUserId ? nameOf(t.ceoUserId) : '대표 미지정'}</span>
              <span className="stitle">{t.name} · 팀원 {t.members?.length || 0} · 유통 {t.circulating || 0}주</span>
              <span className="greward">금고 {(t.corpBalance || 0).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
