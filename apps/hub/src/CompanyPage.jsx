import { useState, useEffect, useMemo } from 'react';
import { watchCompanies, watchAllUsers, watchCompanyLedger, paySalary, payBonus, payTeamDividend } from './data.js';

const TAX_PCT = 10; // 주급 소득세(함수와 동일)

export default function CompanyPage({ session }) {
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const subs = [watchCompanies(setCompanies), watchAllUsers(setUsers)];
    return () => subs.forEach((u) => u());
  }, []);

  const company = useMemo(
    () => companies.find((c) => c.ceoUserId === session.userId) || null,
    [companies, session.userId],
  );

  useEffect(() => {
    if (!company) return undefined;
    return watchCompanyLedger(company.id, setLedger);
  }, [company?.id]);

  const nameOf = (id) => users.find((u) => u.id === id)?.name || id;
  const members = company?.members?.length ? company.members : [];

  // 주급 입력값 { userId: gross }
  const [salary, setSalary] = useState({});
  const [bonusTo, setBonusTo] = useState('');
  const [bonusAmt, setBonusAmt] = useState('');
  const [perShare, setPerShare] = useState('');

  async function run(fn, okText) {
    setBusy(true); setMsg(null);
    try { const r = await fn(); setMsg({ ok: true, text: okText(r) }); }
    catch (e) { setMsg({ ok: false, text: e.message || String(e) }); }
    finally { setBusy(false); }
  }

  if (!company) {
    return (
      <div className="block">
        <h3>내 회사</h3>
        <p className="emptyline">대표(CEO)로 등록된 회사가 없어요. 운영자가 회사를 만들면 여기에 표시됩니다.</p>
      </div>
    );
  }

  const salaryLines = Object.entries(salary)
    .map(([userId, v]) => ({ userId, gross: Math.floor(Number(v)) || 0 }))
    .filter((l) => l.gross > 0);
  const totalGross = salaryLines.reduce((a, l) => a + l.gross, 0);
  const totalTax = salaryLines.reduce((a, l) => a + Math.round((l.gross * TAX_PCT) / 100), 0);

  return (
    <>
      <section className="ledger">
        <div className="cap">회사 금고 · TREASURY</div>
        <div className="net">{(company.corpBalance || 0).toLocaleString()}</div>
        <div className="currencies">
          <div className="cur"><div className="lab">사명</div><div className="val" style={{ fontSize: 16 }}>{company.name}</div></div>
          <div className="cur"><div className="lab">대표</div><div className="val" style={{ fontSize: 16 }}>{session.name}</div></div>
          <div className="cur"><div className="lab">팀원</div><div className="val">{members.length}</div></div>
        </div>
      </section>

      {msg && <p className={msg.ok ? 'okline' : 'err'}>{msg.text}</p>}

      <section className="block">
        <h3>주급 집행 · 소득세 {TAX_PCT}% 원천징수</h3>
        {members.length === 0 && <p className="emptyline">등록된 팀원이 없어요. 운영자에게 팀원 등록을 요청하세요.</p>}
        {members.map((m) => (
          <div className="payrow" key={m}>
            <span className="pname">{nameOf(m)}</span>
            <input type="number" min="0" placeholder="지급액(세전)" value={salary[m] || ''}
              onChange={(e) => setSalary((s) => ({ ...s, [m]: e.target.value }))} />
            <span className="pnet">{salary[m] > 0 ? `실수령 ${Math.round(salary[m] * (100 - TAX_PCT) / 100).toLocaleString()}` : ''}</span>
          </div>
        ))}
        {salaryLines.length > 0 && (
          <p className="muted" style={{ marginTop: 8 }}>
            총 {totalGross.toLocaleString()} 지급 · 세금 {totalTax.toLocaleString()} · 실수령 합 {(totalGross - totalTax).toLocaleString()}
          </p>
        )}
        <button className="primary" disabled={busy || salaryLines.length === 0}
          onClick={() => run(
            () => paySalary({ companyId: company.id, ceoUserId: session.userId, pinHash: session.pinHash, payments: salaryLines }),
            (r) => `주급 지급 완료 — 총 ${r.totalGross.toLocaleString()} (세금 ${r.totalTax.toLocaleString()}, 실수령 ${r.totalNet.toLocaleString()})`,
          ).then(() => setSalary({}))}>
          {busy ? '처리 중…' : '주급 지급'}
        </button>
      </section>

      <section className="block">
        <h3>상여 (무세)</h3>
        <div className="payrow">
          <select value={bonusTo} onChange={(e) => setBonusTo(e.target.value)}>
            <option value="">팀원 선택</option>
            {members.map((m) => <option key={m} value={m}>{nameOf(m)}</option>)}
          </select>
          <input type="number" min="1" placeholder="금액" value={bonusAmt} onChange={(e) => setBonusAmt(e.target.value)} />
          <button disabled={busy || !bonusTo || !(Number(bonusAmt) > 0)}
            onClick={() => run(
              () => payBonus({ companyId: company.id, ceoUserId: session.userId, pinHash: session.pinHash, userId: bonusTo, amount: Math.floor(Number(bonusAmt)) }),
              (r) => `상여 ${r.amount.toLocaleString()} 지급 완료`,
            ).then(() => setBonusAmt(''))}>지급</button>
        </div>
      </section>

      <section className="block">
        <h3>자체 배당 (자사주 보유자)</h3>
        {!company.stockId && <p className="emptyline">상장 종목이 연결되지 않아 배당할 수 없어요.</p>}
        {company.stockId && (
          <div className="payrow">
            <input type="number" min="1" placeholder="주당 배당액" value={perShare} onChange={(e) => setPerShare(e.target.value)} />
            <button disabled={busy || !(Number(perShare) > 0)}
              onClick={() => run(
                () => payTeamDividend({ companyId: company.id, ceoUserId: session.userId, pinHash: session.pinHash, perShare: Math.floor(Number(perShare)) }),
                (r) => `배당 완료 — ${r.count}명에게 총 ${r.total.toLocaleString()}`,
              ).then(() => setPerShare(''))}>배당</button>
          </div>
        )}
      </section>

      <section className="block">
        <h3>회사 원장 (공개)</h3>
        {ledger.length === 0 && <p className="emptyline">아직 기록이 없어요.</p>}
        <ul className="stamps">
          {ledger.map((e) => (
            <li key={e.id}>
              <span className="badge st-open">{e.type}</span>
              <span className="stitle">
                {e.type === 'salary' && `주급 ${(e.totalGross || 0).toLocaleString()} (세금 ${(e.totalTax || 0).toLocaleString()})`}
                {e.type === 'bonus' && `상여 ${(e.amount || 0).toLocaleString()} → ${nameOf(e.userId)}`}
                {e.type === 'team_dividend' && `배당 주당 ${(e.perShare || 0).toLocaleString()} · 총 ${(e.total || 0).toLocaleString()}`}
                {e.type === 'grant' && `금고 충전 ${(e.amount || 0).toLocaleString()} ${e.memo ? `· ${e.memo}` : ''}`}
                {e.type === 'redeem' && `교환 ${e.service} −${(e.cost || 0).toLocaleString()}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
