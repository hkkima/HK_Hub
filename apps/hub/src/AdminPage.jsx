import { useState, useEffect } from 'react';
import { signInWithGoogle, watchAuth, isAdminEmail } from './firebase.js';
import {
  watchTeams, watchAllUsers, watchPendingCorpOrders, watchGrantLedger, watchAllDp,
  grantTeamPoints, fulfillCorpOrder, rejectCorpOrder, grantPoints, grantDP,
} from './data.js';
import PeoplePicker from './PeoplePicker.jsx';

// ★팀 = 주식★ — 상장(팀 생성)·대표/팀원 지정은 HK_Stock 관리자 화면에서 한다(upsertStock).
//   여기서는 팀 금고(stocks.corpBalance) 충전과 현황만 다룬다.
export default function AdminPage() {
  const [gUser, setGUser] = useState(null);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const [grants, setGrants] = useState([]);
  const [dpMap, setDpMap] = useState({});

  useEffect(() => {
    const off = watchAuth(setGUser);
    const subs = [
      watchTeams(setTeams), watchAllUsers(setUsers), watchPendingCorpOrders(setPending),
      watchGrantLedger(setGrants), watchAllDp(setDpMap),
    ];
    return () => { off?.(); subs.forEach((u) => u()); };
  }, []);

  const isAdmin = gUser && !gUser.isAnonymous && isAdminEmail(gUser.email);
  const nameOf = (id) => users.find((u) => u.id === id)?.name || id;
  const teamName = (id) => teams.find((t) => t.id === id)?.name || id;
  const [g, setG] = useState({ stockId: '', amount: '', memo: '', source: 'house' });
  const [p, setP] = useState({ ids: [], delta: '', memo: '' });            // P 지급(다중)
  const [pa, setPa] = useState({ delta: '', memo: '' });                   // P 전원 지급
  const [dg, setDg] = useState({ ids: [], amount: '', memo: '' });         // DP 지급

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
        <h3>P 지급/조정 (선택 · 전원)</h3>
        <p className="muted" style={{ marginBottom: 10 }}>
          지급분은 <b>housePool에서 나가고</b>, 음수(회수)는 housePool로 돌아갑니다(총량보존 — 발행이 아님).
          순발행이 필요하면 HK_Stock 관리자에서 mint 후 지급하세요. 전 건 원장(<code>admin_grant</code>) 기록.
        </p>
        <PeoplePicker
          users={users} teams={teams} value={p.ids}
          onChange={(ids) => setP({ ...p, ids })}
          badgeOf={(u) => Math.round(u.balance || 0)} unit="P"
        />
        <div className="formgrid" style={{ marginTop: 10 }}>
          <input type="number" placeholder="증감 (음수=회수)" value={p.delta} onChange={(e) => setP({ ...p, delta: e.target.value })} />
          <input placeholder="메모" value={p.memo} onChange={(e) => setP({ ...p, memo: e.target.value })} />
        </div>
        <button className="primary" disabled={busy || !p.ids.length || !Number(p.delta)}
          onClick={() => run(
            () => grantPoints({ userIds: p.ids, delta: Math.floor(Number(p.delta)), memo: p.memo }),
            (r) => `${r.count}명에게 ${r.delta > 0 ? '+' : ''}${r.delta.toLocaleString()}P`,
          ).then(() => setP({ ids: [], delta: '', memo: '' }))}>
          선택한 {p.ids.length}명에게 지급
        </button>
        <div className="formgrid" style={{ marginTop: 10 }}>
          <input type="number" placeholder="전원 증감 (음수=회수)" value={pa.delta} onChange={(e) => setPa({ ...pa, delta: e.target.value })} />
          <input placeholder="메모" value={pa.memo} onChange={(e) => setPa({ ...pa, memo: e.target.value })} />
        </div>
        <button className="primary" disabled={busy || !Number(pa.delta)}
          onClick={() => {
            if (!window.confirm(`등록된 전원(${users.length}명)에게 각 ${pa.delta}P 를 적용합니다. 계속할까요?`)) return;
            run(
              () => grantPoints({ all: true, delta: Math.floor(Number(pa.delta)), memo: pa.memo }),
              (r) => `전원 지급 완료 — ${r.count}명 × ${r.delta > 0 ? '+' : ''}${r.delta.toLocaleString()}P`,
            ).then(() => setPa({ delta: '', memo: '' }));
          }}>
          전원 지급
        </button>
      </section>

      <section className="block">
        <h3>이벤트 DP 지급</h3>
        <p className="muted" style={{ marginBottom: 10 }}>
          DP는 별개 통화(housePool 무영향)입니다. 음수면 회수. 전 건 원장(<code>dp_grant</code>) 기록.
          이름을 눌러 켜고 끄고, 팀 단위로도 집을 수 있어요(오른쪽 숫자는 현재 보유 DP).
        </p>
        <PeoplePicker
          users={users} teams={teams} value={dg.ids}
          onChange={(ids) => setDg({ ...dg, ids })}
          badgeOf={(u) => dpMap[u.id] || 0} unit="DP"
        />
        <div className="formgrid" style={{ marginTop: 10 }}>
          <input type="number" placeholder="DP (음수=회수)" value={dg.amount} onChange={(e) => setDg({ ...dg, amount: e.target.value })} />
          <input placeholder="메모" value={dg.memo} onChange={(e) => setDg({ ...dg, memo: e.target.value })} />
        </div>
        <button className="primary" disabled={busy || !dg.ids.length || !Number(dg.amount)}
          onClick={() => run(
            () => grantDP({ userIds: dg.ids, amount: Math.floor(Number(dg.amount)), memo: dg.memo }),
            (r) => `${r.count}명에게 ${r.amount > 0 ? '+' : ''}${r.amount} DP`,
          ).then(() => setDg({ ids: [], amount: '', memo: '' }))}>
          선택한 {dg.ids.length}명에게 DP 지급
        </button>
      </section>

      <section className="block">
        <h3>지급 이력 (최근 {grants.length}건)</h3>
        {grants.length === 0 && <p className="emptyline">지급 기록이 없어요.</p>}
        {grants.map((r) => (
          <div className="payrow" key={r.id}>
            <span className="pname">
              <span className={`badge ${r.type === 'admin_grant' ? 'st-go' : 'st-warn'}`}>{r.type === 'admin_grant' ? 'P' : 'DP'}</span>
              {' '}{nameOf(r.userId)}{r.all ? ' (전원)' : ''}{r.memo ? <span className="muted"> — {r.memo}</span> : null}
            </span>
            <span className="pnet mono">{(r.amount || 0) > 0 ? '+' : ''}{(r.amount || 0).toLocaleString()}</span>
            <span className="muted">{r.ts?.seconds ? new Date(r.ts.seconds * 1000).toLocaleString('ko-KR') : ''}</span>
          </div>
        ))}
      </section>

      <section className="block">
        <h3>교환소 주문 큐 ({pending.length})</h3>
        <p className="muted" style={{ marginBottom: 10 }}>
          납품이 끝나면 <b>이행 완료</b>, 들어줄 수 없으면 <b>거부</b>하세요.
          거부하면 대금이 <b>팀 금고로 환불</b>됩니다(소각 되돌리기).
        </p>
        {pending.length === 0 && <p className="emptyline">대기 중인 주문이 없어요.</p>}
        {pending.map((o) => (
          <div className="payrow" key={o.id}>
            <span className="pname">
              {teamName(o.stockId)} · <b>{o.serviceName || o.service}</b>
              {o.params?.note ? <span className="muted"> — {o.params.note}</span> : null}
            </span>
            <span className="pnet mono">{(o.cost || 0).toLocaleString()}</span>
            <button disabled={busy}
              onClick={() => run(() => fulfillCorpOrder({ orderId: o.id }), () => '이행 완료 처리됨')}>완료</button>
            <button disabled={busy}
              onClick={() => {
                const reason = window.prompt('거부 사유 (팀에게 공개됩니다)');
                if (reason === null) return null;
                return run(
                  () => rejectCorpOrder({ orderId: o.id, reason }),
                  (r) => `거부 — ${r.refund.toLocaleString()} 환불됨`,
                );
              }}>거부</button>
          </div>
        ))}
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
