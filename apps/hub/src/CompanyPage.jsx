import { useState, useEffect, useMemo } from 'react';
import {
  watchTeams, watchAllUsers, watchTeamLedger, watchCorpServices, watchCorpOrders,
  paySalary, payBonus, payTeamDividend, redeemCorpService,
} from './data.js';

const TIER_LABEL = {
  T1: 'T1 · 까미 노동',
  T2: 'T2 · 강사 직접',
  T3: 'T3 · 까미 비전스 계약',
};
const ORDER_LABEL = { pending: '대기', fulfilled: '완료', rejected: '거부' };
const ORDER_BADGE = { pending: 'st-open', fulfilled: 'st-done', rejected: 'st-off' };

const TAX_PCT = 10;       // 주급 소득세(함수 SALARY_TAX_BPS 와 동일)
const BONUS_TAX_PCT = 15; // 상여 소득세(함수 BONUS_TAX_BPS 와 동일)

// 급여 주 키 — ★HK_Stock functions/index.js payWeekKey 와 동일 로직 유지★
//   경계 = 월요일 09:00(KST). 9시간 뒤로 민 뒤 ISO 주 키를 구하면 월 09:00 이 월 00:00 으로 정렬된다.
function seoulWeekKey(d = new Date()) {
  const s = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const day = (s.getDay() + 6) % 7;
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - day + 3);
  const firstThu = new Date(s.getFullYear(), 0, 4);
  const week = 1 + Math.round(((s - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return `${s.getFullYear()}-W${String(week).padStart(2, '0')}`;
}
const payWeekKey = (d = new Date()) => seoulWeekKey(new Date(d.getTime() - 9 * 60 * 60 * 1000));

export default function CompanyPage({ session }) {
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [orders, setOrders] = useState([]);
  const [services, setServices] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const subs = [watchTeams(setTeams), watchAllUsers(setUsers), watchCorpServices(setServices)];
    return () => subs.forEach((u) => u());
  }, []);

  // 대표면 집행 화면, 팀원이면 같은 탭에서 읽기 전용 장부 화면.
  //   ★팀원 열람은 투명성 견제 장치★ — CEO 지출을 팀원이 볼 수 있어야 금고 감시가 성립한다.
  //   teamLedger·corpOrders 는 규칙상 이미 공개 읽기라 별도 권한 작업이 필요 없다.
  const company = useMemo(
    () => teams.find((c) => c.ceoUserId === session.userId)
      || teams.find((c) => Array.isArray(c.members) && c.members.includes(session.userId))
      || null,
    [teams, session.userId],
  );
  const isCeo = !!company && company.ceoUserId === session.userId;

  useEffect(() => {
    if (!company) return undefined;
    const subs = [watchTeamLedger(company.id, setLedger), watchCorpOrders(company.id, setOrders)];
    return () => subs.forEach((u) => u());
  }, [company?.id]);

  const nameOf = (id) => users.find((u) => u.id === id)?.name || id;
  const members = company?.members?.length ? company.members : [];

  // 주급은 1주 1회 — 팀 문서의 lastSalaryWeek 가 이번 급여 주와 같으면 소진.
  const paidThisWeek = !!company && company.lastSalaryWeek === payWeekKey();

  // 주급 입력값 { userId: gross }
  const [salary, setSalary] = useState({});
  const [bonusTo, setBonusTo] = useState('');
  const [bonusAmt, setBonusAmt] = useState('');
  const [perShare, setPerShare] = useState('');
  const [orderNote, setOrderNote] = useState('');

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
        <p className="emptyline">소속된 회사가 없어요. 운영자가 팀에 배정하면 여기에 표시됩니다.</p>
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
          <div className="cur"><div className="lab">대표</div><div className="val" style={{ fontSize: 16 }}>{nameOf(company.ceoUserId)}</div></div>
          <div className="cur"><div className="lab">팀원</div><div className="val">{members.length}</div></div>
        </div>
      </section>

      {msg && <p className={msg.ok ? 'okline' : 'err'}>{msg.text}</p>}

      {!isCeo && (
        <p className="muted" style={{ marginTop: 0 }}>
          👀 <b>팀원 열람</b> — 회사 금고와 지출 내역을 볼 수 있습니다. 집행은 대표({nameOf(company.ceoUserId)})만 가능합니다.
        </p>
      )}

      {isCeo && <>
      <section className="block">
        <h3>주급 집행 · 소득세 {TAX_PCT}% 원천징수</h3>
        {paidThisWeek
          ? <p className="emptyline">✅ 이번 주 주급은 이미 집행했습니다. 다음 <b>월요일 09:00</b> 이후 다시 지급할 수 있어요.</p>
          : <p className="muted" style={{ marginTop: 0 }}>주급은 <b>한 주에 한 번</b>만 집행할 수 있습니다(경계 = 월요일 09:00). 한 번에 전원 몫을 함께 넣으세요.</p>}
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
        <button className="primary" disabled={busy || salaryLines.length === 0 || paidThisWeek}
          onClick={() => run(
            () => paySalary({ stockId: company.id, ceoUserId: session.userId, pinHash: session.pinHash, payments: salaryLines }),
            (r) => `주급 지급 완료 — 총 ${r.totalGross.toLocaleString()} (세금 ${r.totalTax.toLocaleString()}, 실수령 ${r.totalNet.toLocaleString()})`,
          ).then(() => setSalary({}))}>
          {busy ? '처리 중…' : '주급 지급'}
        </button>
      </section>

      <section className="block">
        <h3>상여 · 소득세 {BONUS_TAX_PCT}% 원천징수</h3>
        <div className="payrow">
          <select value={bonusTo} onChange={(e) => setBonusTo(e.target.value)}>
            <option value="">팀원 선택</option>
            {members.map((m) => <option key={m} value={m}>{nameOf(m)}</option>)}
          </select>
          <input type="number" min="1" placeholder="금액(세전)" value={bonusAmt} onChange={(e) => setBonusAmt(e.target.value)} />
          <span className="pnet">
            {Number(bonusAmt) > 0 ? `실수령 ${Math.round(bonusAmt * (100 - BONUS_TAX_PCT) / 100).toLocaleString()}` : ''}
          </span>
          <button disabled={busy || !bonusTo || !(Number(bonusAmt) > 0)}
            onClick={() => run(
              () => payBonus({ stockId: company.id, ceoUserId: session.userId, pinHash: session.pinHash, userId: bonusTo, amount: Math.floor(Number(bonusAmt)) }),
              (r) => `상여 지급 완료 — 세전 ${r.amount.toLocaleString()} (세금 ${r.tax.toLocaleString()}, 실수령 ${r.net.toLocaleString()})`,
            ).then(() => setBonusAmt(''))}>지급</button>
        </div>
      </section>

      <section className="block">
        <h3>자체 배당 (자사주 보유자)</h3>
        {!(company.circulating > 0) && <p className="emptyline">유통 중인 자사주가 없어 배당할 수 없어요.</p>}
        {company.circulating > 0 && (
          <div className="payrow">
            <input type="number" min="1" placeholder="주당 배당액" value={perShare} onChange={(e) => setPerShare(e.target.value)} />
            <button disabled={busy || !(Number(perShare) > 0)}
              onClick={() => run(
                () => payTeamDividend({ stockId: company.id, ceoUserId: session.userId, pinHash: session.pinHash, perShare: Math.floor(Number(perShare)) }),
                (r) => `배당 완료 — ${r.count}명에게 총 ${r.total.toLocaleString()}`,
              ).then(() => setPerShare(''))}>배당</button>
          </div>
        )}
      </section>

      <section className="block">
        <h3>팀 포인트 교환소</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          구매 대금은 금고에서 <b>소각</b>됩니다(팀원 지갑으로 가지 않음). 납품이 끝나면 운영자가 이행 처리하고,
          들어드릴 수 없는 주문은 거부되어 <b>금고로 환불</b>됩니다.
        </p>
        {Object.keys(services).length === 0 && <p className="emptyline">가격표가 아직 설정되지 않았어요.</p>}
        {['T1', 'T2', 'T3'].map((tier) => {
          const items = Object.entries(services).filter(([, s]) => s.tier === tier);
          if (!items.length) return null;
          return (
            <div key={tier} style={{ marginTop: 10 }}>
              <div className="cap">{TIER_LABEL[tier] || tier}</div>
              {items.map(([key, s]) => {
                const afford = (company.corpBalance || 0) >= s.price;
                return (
                  <div className="payrow" key={key}>
                    <span className="pname" title={s.desc}>{s.name} <span className="muted">· {s.phase}</span></span>
                    <span className="pnet mono">{s.price.toLocaleString()}</span>
                    <button disabled={busy || !afford}
                      onClick={() => run(
                        () => redeemCorpService({ stockId: company.id, ceoUserId: session.userId, pinHash: session.pinHash, service: key, params: { note: orderNote } }),
                        (r) => (r.status === 'fulfilled'
                          ? `${s.name} 체결 — ${r.cost.toLocaleString()} 소각${r.effect ? ' · 뉴스 게시됨' : ''}`
                          : `${s.name} 접수 — ${r.cost.toLocaleString()} 소각. 운영자 확인을 기다립니다.`),
                      ).then(() => setOrderNote(''))}>
                      {afford ? '구매' : '금고 부족'}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
        <input style={{ width: '100%', marginTop: 8 }} placeholder="요청사항(선택) — 주제·마감·참고 링크 등"
          value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
      </section>
      </>}

      <section className="block">
        <h3>주문 현황</h3>
        {orders.length === 0 && <p className="emptyline">아직 주문이 없어요.</p>}
        <ul className="stamps">
          {orders.map((o) => (
            <li key={o.id}>
              <span className={`badge ${ORDER_BADGE[o.status] || 'st-open'}`}>{ORDER_LABEL[o.status] || o.status}</span>
              <span className="stitle">
                {o.serviceName || o.service} · {(o.cost || 0).toLocaleString()}
                {o.status === 'rejected' && o.reason ? ` — 거부 사유: ${o.reason}` : ''}
              </span>
            </li>
          ))}
        </ul>
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
                {e.type === 'bonus' && `상여 ${(e.amount || 0).toLocaleString()}${e.tax ? ` (세금 ${e.tax.toLocaleString()})` : ''} → ${nameOf(e.userId)}`}
                {e.type === 'team_dividend' && `배당 주당 ${(e.perShare || 0).toLocaleString()} · 총 ${(e.total || 0).toLocaleString()}`}
                {e.type === 'grant' && `금고 충전 ${(e.amount || 0).toLocaleString()} ${e.memo ? `· ${e.memo}` : ''}`}
                {e.type === 'redeem' && `교환소 구매 ${e.serviceName || e.service} −${(e.cost || 0).toLocaleString()} (소각)`}
                {e.type === 'redeem_fulfilled' && `납품 완료 ${e.serviceName || e.service}`}
                {e.type === 'redeem_refund' && `주문 거부 환불 ${e.serviceName || e.service} +${(e.amount || 0).toLocaleString()}${e.reason ? ` · ${e.reason}` : ''}`}
                {e.type === 'offer_subscribe' && `유상증자 청약 ${nameOf(e.userId)} ${e.qty}주 +${(e.amount || 0).toLocaleString()}`}
                {e.type === 'offer_buyback' && `신주 환매 ${nameOf(e.userId)} ${e.qty}주 −${(e.amount || 0).toLocaleString()}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
