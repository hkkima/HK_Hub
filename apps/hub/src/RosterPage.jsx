import { useState, useEffect, useMemo } from 'react';
import { signInWithGoogle, watchAuth, isAdminEmail } from './firebase.js';
import {
  watchAllUsers, watchAllDp, watchPendingRedemptions, watchDpParams, watchTeams,
} from './data.js';

// 수강생 P/DP 현황판 — ★운영자 전용★.
//   지급(grantPoints·grantDP)은 [관리]에서 하고, 여기서는 "누가 얼마나 갖고 있나"만 본다.
//   읽기 소스는 전부 공개 읽기 컬렉션(users·dpAccounts·dpRedemptions·stocks·meta)이라
//   콜러블을 새로 만들 필요가 없다. 화면 게이트는 관리 화면과 같은 Google 이메일 판정.
const SORTS = {
  point: { label: '포인트순', fn: (a, b) => b.balance - a.balance },
  dp: { label: 'DP순', fn: (a, b) => b.dp - a.dp },
  name: { label: '이름순', fn: (a, b) => a.name.localeCompare(b.name, 'ko') },
  team: { label: '팀순', fn: (a, b) => (a.team || 'ㅎ힣').localeCompare(b.team || 'ㅎ힣', 'ko') || b.balance - a.balance },
};

export default function RosterPage() {
  const [gUser, setGUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [dpMap, setDpMap] = useState({});
  const [pending, setPending] = useState({});
  const [dpCfg, setDpCfg] = useState({});
  const [teams, setTeams] = useState([]);
  const [sort, setSort] = useState('point');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const off = watchAuth(setGUser);
    const subs = [
      watchAllUsers(setUsers), watchAllDp(setDpMap),
      watchPendingRedemptions(setPending), watchDpParams(setDpCfg), watchTeams(setTeams),
    ];
    return () => { off?.(); subs.forEach((u) => u && u()); };
  }, []);

  const isAdmin = gUser && !gUser.isAnonymous && isAdminEmail(gUser.email);

  // 팀(=주식) 멤버 → 팀 이름 역인덱스.
  const teamOf = useMemo(() => {
    const map = {};
    for (const t of teams) {
      for (const m of t.members || []) map[m] = t.name || t.id;
      if (t.ceoUserId) map[t.ceoUserId] = t.name || t.id;
    }
    return map;
  }, [teams]);

  const rows = useMemo(() => {
    const list = users.map((u) => ({
      id: u.id,
      name: u.name || u.id,
      balance: Math.round(u.balance || 0),
      dp: dpMap[u.id] || 0,
      wait: pending[u.id] || 0,
      team: teamOf[u.id] || '',
    }));
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? list.filter((r) => r.name.toLowerCase().includes(needle)
        || r.id.toLowerCase().includes(needle)
        || (r.team || '').toLowerCase().includes(needle))
      : list;
    return filtered.sort(SORTS[sort].fn);
  }, [users, dpMap, pending, teamOf, q, sort]);

  const tot = useMemo(() => rows.reduce((a, r) => ({
    p: a.p + r.balance, dp: a.dp + r.dp, wait: a.wait + r.wait,
  }), { p: 0, dp: 0, wait: 0 }), [rows]);

  const krwPerDp = Number(dpCfg.krwPerDp ?? 500);
  const fmt = (n) => n.toLocaleString('ko-KR');

  function copyTsv() {
    const head = ['이름', '계정ID', '팀', '포인트', 'DP', '교환대기'].join('\t');
    const body = rows.map((r) => [r.name, r.id, r.team, r.balance, r.dp, r.wait].join('\t')).join('\n');
    const text = `${head}\n${body}`;
    navigator.clipboard?.writeText(text)
      .then(() => setMsg({ ok: true, text: `${rows.length}명 복사됨 — 스프레드시트에 붙여넣으세요.` }))
      .catch(() => setMsg({ ok: false, text: '복사 실패 — 브라우저가 클립보드를 막았습니다.' }));
  }

  if (!isAdmin) {
    return (
      <div className="block">
        <h3>수강생 현황</h3>
        <p className="emptyline">
          운영자 Google 계정으로 로그인이 필요합니다.
          {gUser && !gUser.isAnonymous && ` (현재 ${gUser.email} — 운영자 아님)`}
        </p>
        <button className="primary" style={{ maxWidth: 240 }} onClick={() => signInWithGoogle()}>
          Google로 운영자 로그인
        </button>
      </div>
    );
  }

  return (
    <>
      <section className="block">
        <h3>수강생 현황 ({rows.length}명)</h3>
        <div className="rost-sum">
          <div className="rs-cell">
            <div className="lab">포인트 합계</div>
            <div className="num mono">{fmt(tot.p)} P</div>
          </div>
          <div className="rs-cell">
            <div className="lab">DP 합계</div>
            <div className="num mono">{fmt(tot.dp)} DP</div>
          </div>
          <div className="rs-cell">
            <div className="lab">DP 현금 환산 ({fmt(krwPerDp)}원/DP)</div>
            <div className="num mono">{fmt(tot.dp * krwPerDp)} 원</div>
          </div>
          <div className="rs-cell">
            <div className="lab">현물 지급 대기</div>
            <div className={`num mono ${tot.wait > 0 ? 'warn-num' : ''}`}>{fmt(tot.wait)} 건</div>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          DP 합계는 <b>아직 현물로 나가지 않은 부채</b>입니다. 지급·회수는 [관리] 탭에서 합니다.
        </p>
      </section>

      <section className="block">
        <div className="formgrid" style={{ marginBottom: 10 }}>
          <input placeholder="이름 · 계정ID · 팀 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={copyTsv}>표 복사(TSV)</button>
        </div>
        {msg && <p className={msg.ok ? 'okline' : 'err'}>{msg.text}</p>}

        {rows.length === 0 && <p className="emptyline">해당하는 수강생이 없어요.</p>}
        {rows.length > 0 && (
          <div className="rost-wrap">
            <table className="rost">
              <thead>
                <tr>
                  <th>#</th><th>이름</th><th>팀</th>
                  <th className="num">포인트</th><th className="num">DP</th><th className="num">교환대기</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="mono dim">{i + 1}</td>
                    <td>
                      {r.name}
                      {r.name !== r.id && <span className="muted mono"> {r.id}</span>}
                    </td>
                    <td>{r.team || <span className="muted">—</span>}</td>
                    <td className="num mono">{fmt(r.balance)}</td>
                    <td className="num mono gold">{r.dp ? fmt(r.dp) : <span className="muted">0</span>}</td>
                    <td className="num mono">
                      {r.wait ? <span className="stamp s-warn">{r.wait}</span> : <span className="muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
