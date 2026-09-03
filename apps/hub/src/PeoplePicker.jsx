import { useMemo, useState } from 'react';

// 다중 선택 명단 — ★한 번 클릭으로 토글★.
//   구 판은 <select multiple> 이라 Ctrl/⌘ 클릭이 필요했고, 하나 잘못 누르면 선택이 통째로 날아갔다.
//   여기서는 칩을 눌러 켜고 끄고, 팀 단위·전체 단위로도 집는다.
//   value = 선택된 userId 배열(상위 상태), onChange(next) 로만 바뀐다.
export default function PeoplePicker({ users, teams = [], value, onChange, badgeOf, unit = '' }) {
  const [q, setQ] = useState('');
  const sel = useMemo(() => new Set(value), [value]);

  // 팀(=주식) → 소속 userId 목록. 대표도 팀원으로 친다.
  const teamRows = useMemo(() => teams
    .map((t) => {
      const ids = new Set([...(t.members || []), ...(t.ceoUserId ? [t.ceoUserId] : [])]);
      return { id: t.id, name: t.name || t.id, ids: [...ids].filter((id) => users.some((u) => u.id === id)) };
    })
    .filter((t) => t.ids.length > 0), [teams, users]);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? users.filter((u) => (u.name || u.id).toLowerCase().includes(needle) || u.id.toLowerCase().includes(needle))
    : users;

  const setIds = (ids) => onChange([...new Set(ids)]);
  const toggle = (id) => (sel.has(id) ? setIds(value.filter((x) => x !== id)) : setIds([...value, id]));
  const allShownOn = shown.length > 0 && shown.every((u) => sel.has(u.id));

  function toggleTeam(t) {
    const on = t.ids.every((id) => sel.has(id));
    setIds(on ? value.filter((x) => !t.ids.includes(x)) : [...value, ...t.ids]);
  }

  return (
    <div className="picker">
      <div className="pk-bar">
        <input className="pk-search" placeholder="이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" onClick={() => setIds(allShownOn ? value.filter((x) => !shown.some((u) => u.id === x)) : [...value, ...shown.map((u) => u.id)])}>
          {allShownOn ? '보이는 사람 해제' : `보이는 사람 전체 (${shown.length})`}
        </button>
        <button type="button" disabled={!value.length} onClick={() => setIds([])}>선택 해제</button>
      </div>

      {teamRows.length > 0 && (
        <div className="pk-teams">
          <span className="pk-lab">팀 단위</span>
          {teamRows.map((t) => {
            const on = t.ids.every((id) => sel.has(id));
            return (
              <button key={t.id} type="button" className={`pk-team ${on ? 'on' : ''}`} onClick={() => toggleTeam(t)}>
                {t.name} <span className="pk-n">{t.ids.length}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="pk-grid">
        {shown.map((u) => {
          const on = sel.has(u.id);
          const badge = badgeOf ? badgeOf(u) : null;
          return (
            <button key={u.id} type="button" className={`pk-chip ${on ? 'on' : ''}`} onClick={() => toggle(u.id)}>
              <span className="pk-check" aria-hidden="true">{on ? '✔' : ''}</span>
              <span className="pk-name">{u.name || u.id}</span>
              {badge !== null && badge !== undefined && (
                <span className="pk-badge mono">{badge.toLocaleString()}{unit}</span>
              )}
            </button>
          );
        })}
        {shown.length === 0 && <p className="emptyline">검색 결과가 없어요.</p>}
      </div>

      <div className="pk-sum">
        {value.length === 0
          ? <span className="muted">아직 아무도 선택하지 않았어요.</span>
          : <><b>{value.length}명</b> 선택됨 — {value.map((id) => users.find((u) => u.id === id)?.name || id).join(', ')}</>}
      </div>
    </div>
  );
}
