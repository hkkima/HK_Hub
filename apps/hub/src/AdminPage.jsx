import { useState, useEffect } from 'react';
import { signInWithGoogle, watchAuth, isAdminEmail } from './firebase.js';
import { watchCompanies, watchAllUsers, upsertCompany, grantCorpPoints } from './data.js';

export default function AdminPage() {
  const [gUser, setGUser] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const off = watchAuth(setGUser);
    const subs = [watchCompanies(setCompanies), watchAllUsers(setUsers)];
    return () => { off?.(); subs.forEach((u) => u()); };
  }, []);

  const isAdmin = gUser && !gUser.isAnonymous && isAdminEmail(gUser.email);
  const nameOf = (id) => users.find((u) => u.id === id)?.name || id;

  // 회사 생성 폼
  const [f, setF] = useState({ companyId: '', name: '', ceoUserId: '', stockId: '', members: '' });
  // 자본 배분 폼
  const [g, setG] = useState({ companyId: '', amount: '', memo: '', source: 'house' });

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
        <h3>회사 생성 / 수정</h3>
        <div className="formgrid">
          <input placeholder="회사ID (예: team1)" value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value })} />
          <input placeholder="사명" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select value={f.ceoUserId} onChange={(e) => setF({ ...f, ceoUserId: e.target.value })}>
            <option value="">대표(CEO) 선택</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.id}</option>)}
          </select>
          <input placeholder="상장 종목ID (선택)" value={f.stockId} onChange={(e) => setF({ ...f, stockId: e.target.value })} />
          <input placeholder="팀원 userId 쉼표구분" value={f.members} onChange={(e) => setF({ ...f, members: e.target.value })} style={{ gridColumn: '1 / -1' }} />
        </div>
        <button className="primary" disabled={busy || !f.companyId || !f.name || !f.ceoUserId}
          onClick={() => run(
            () => upsertCompany({
              companyId: f.companyId.trim(),
              name: f.name.trim(),
              ceoUserId: f.ceoUserId,
              stockId: f.stockId.trim() || undefined,
              members: f.members.split(',').map((s) => s.trim()).filter(Boolean),
            }),
            (r) => `${r.companyId} ${r.created ? '생성' : '수정'} 완료`,
          )}>
          {busy ? '처리 중…' : '저장'}
        </button>
      </section>

      <section className="block">
        <h3>금고 충전 (순위 배당 · 초기자본)</h3>
        <div className="formgrid">
          <select value={g.companyId} onChange={(e) => setG({ ...g, companyId: e.target.value })}>
            <option value="">회사 선택</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="number" placeholder="금액" value={g.amount} onChange={(e) => setG({ ...g, amount: e.target.value })} />
          <select value={g.source} onChange={(e) => setG({ ...g, source: e.target.value })}>
            <option value="house">housePool에서 (총량보존)</option>
            <option value="mint">신규 발행 (mint)</option>
          </select>
          <input placeholder="메모" value={g.memo} onChange={(e) => setG({ ...g, memo: e.target.value })} />
        </div>
        <button className="primary" disabled={busy || !g.companyId || !Number(g.amount)}
          onClick={() => run(
            () => grantCorpPoints({ companyId: g.companyId, amount: Math.floor(Number(g.amount)), memo: g.memo, source: g.source }),
            (r) => `${r.companyId} 금고 ${r.amount.toLocaleString()} 충전 (${r.source})`,
          ).then(() => setG({ ...g, amount: '', memo: '' }))}>
          충전
        </button>
      </section>

      <section className="block">
        <h3>회사 목록 ({companies.length})</h3>
        {companies.length === 0 && <p className="emptyline">아직 회사가 없어요.</p>}
        <ul className="stamps">
          {companies.map((c) => (
            <li key={c.id}>
              <span className="badge st-go">{c.id}</span>
              <span className="stitle">{c.name} · 대표 {nameOf(c.ceoUserId)} · 팀원 {c.members?.length || 0}</span>
              <span className="greward">{(c.corpBalance || 0).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
