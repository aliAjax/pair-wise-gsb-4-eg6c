import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Check, ChevronRight, Clock3, Edit3, History, Mic, Pause, Play, Plus, RotateCcw, Search, Volume2 } from 'lucide-react';

type Level = '入门' | '进阶' | '挑战';
type Status = 'new' | 'practice' | 'mastered' | 'archived';
type PracticeRecord = { id: string; day: string; score: number; seconds: number; createdAt: number };
type Version = { id: string; no: number; text: string; translation: string; note: string; createdAt: number; records: PracticeRecord[]; masteredAt: number | null };
type Phrase = { id: string; tag: string; level: Level; createdAt: number; versions: Version[]; currentVersionId: string; archivedAt: number | null; archiveReason: string };

const STORE_KEY = 'sound-lab-v2';
const MASTER_DAYS = 2;
const MASTER_SCORE = 85;

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const fmtDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return fmtDay(d); };
const dayLabel = (day: string) => day === dayAgo(0) ? '今天' : day === dayAgo(1) ? '昨天' : `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;
const fmtTime = (ts: number) => { const d = new Date(ts); return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

const cur = (p: Phrase): Version => p.versions.find(v => v.id === p.currentVersionId) ?? p.versions[p.versions.length - 1];
const sortedRecords = (v: Version): PracticeRecord[] => [...v.records].sort((a, b) => a.day.localeCompare(b.day) || a.createdAt - b.createdAt);
const daysOf = (v: Version) => new Set(v.records.map(r => r.day)).size;
const latestOf = (v: Version): PracticeRecord | undefined => sortedRecords(v)[v.records.length - 1];
const statusOf = (p: Phrase): Status => p.archivedAt ? 'archived' : cur(p).masteredAt ? 'mastered' : cur(p).records.length ? 'practice' : 'new';
const hasHistory = (p: Phrase) => p.versions.length > 1 || p.versions.some(v => v.records.length > 0);
const nextNo = (p: Phrase) => Math.max(...p.versions.map(v => v.no)) + 1;

// 掌握判定：跨 MASTER_DAYS 个练习日，且最新一次评分 >= MASTER_SCORE；一旦达标保持，直到再次修改句子
const withMastery = (v: Version): Version => {
  if (v.masteredAt) return v;
  const latest = latestOf(v);
  if (latest && daysOf(v) >= MASTER_DAYS && latest.score >= MASTER_SCORE) return { ...v, masteredAt: Date.now() };
  return v;
};

const buildSeed = (): Phrase[] => {
  const now = Date.now();
  const mk = (offset: number, score: number, seconds: number): PracticeRecord => ({ id: uid(), day: dayAgo(offset), score, seconds, createdAt: now - offset * 864e5 });
  const ver = (no: number, text: string, translation: string, note: string, offset: number, records: PracticeRecord[], masteredAt: number | null = null): Version => ({ id: uid(), no, text, translation, note, createdAt: now - offset * 864e5, records, masteredAt });
  const phrase = (tag: string, level: Level, versions: Version[], archivedAt: number | null = null, archiveReason = ''): Phrase => ({ id: uid(), tag, level, createdAt: versions[0].createdAt, versions, currentVersionId: versions[versions.length - 1].id, archivedAt, archiveReason });
  return [
    phrase('日常', '入门', [ver(1, 'The morning light feels different today.', '今天的晨光感觉不一样。', '初始版本', 3, [mk(2, 78, 9), mk(0, 84, 11)])]),
    phrase('工作', '进阶', [ver(1, 'Could you walk me through the next step?', '你能带我了解下一步吗？', '初始版本', 1, [])]),
    phrase('表达', '挑战', [ver(1, 'I appreciate your patience and thoughtful feedback.', '感谢你的耐心和细致反馈。', '初始版本', 5, [mk(3, 82, 12), mk(1, 88, 10)], now - 864e5)]),
    phrase('灵感', '入门', [
      ver(1, 'Let’s make room for a little curiosity.', '给好奇心留一点空间。', '初始版本', 6, [mk(4, 71, 8), mk(3, 87, 9)], now - 3 * 864e5),
      ver(2, 'Let’s make room for a little curiosity today.', '今天，给好奇心留一点空间。', '结尾补充 today，语气更轻快', 1, [mk(0, 76, 10)]),
    ]),
    phrase('绕口令', '挑战', [ver(1, 'She sells seashells by the seashore.', '她在海边卖贝壳。', '初始版本', 7, [mk(5, 65, 7), mk(4, 72, 8)])], now - 2 * 864e5, '辅音连读太难，先集中练元音，过段时间再回来'),
  ];
};

const load = (): Phrase[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '');
    if (Array.isArray(raw) && raw.length && raw.every(p => Array.isArray(p.versions) && typeof p.currentVersionId === 'string')) return raw;
  } catch { /* fall through to seed */ }
  return buildSeed();
};

const bars = Array.from({ length: 68 }, (_, i) => 18 + ((i * 29) % 44));
const STATUS_LABEL: Record<Status, string> = { new: '新句子', practice: '练习中', mastered: '已掌握', archived: '已归档' };

export default function App() {
  const [phrases, setPhrases] = useState<Phrase[]>(load);
  const [selected, setSelected] = useState<string>(() => {
    const stored = localStorage.getItem(STORE_KEY + '-selected');
    return (stored && phrases.some(p => p.id === stored)) ? stored : (phrases.find(p => !p.archivedAt)?.id ?? phrases[0]?.id ?? '');
  });
  const [filter, setFilter] = useState('全部');
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [score, setScore] = useState(80);
  const [recordDay, setRecordDay] = useState(dayAgo(0));
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState('');
  const [newTrans, setNewTrans] = useState('');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editTrans, setEditTrans] = useState('');
  const [editNote, setEditNote] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const current = phrases.find(p => p.id === selected) ?? phrases.find(p => !p.archivedAt) ?? phrases[0];
  const active = phrases.filter(p => !p.archivedAt);
  const todo = active.filter(p => statusOf(p) !== 'mastered');
  const masteredCount = phrases.filter(p => statusOf(p) === 'mastered').length;
  const archivedCount = phrases.filter(p => p.archivedAt).length;
  const totalRecords = phrases.reduce((n, p) => n + p.versions.reduce((m, v) => m + v.records.length, 0), 0);
  const todayRecords = phrases.reduce((n, p) => n + p.versions.reduce((m, v) => m + v.records.filter(r => r.day === dayAgo(0)).length, 0), 0);

  const filtered = useMemo(() => phrases.filter(p => {
    const s = statusOf(p);
    const inFilter = filter === '全部' ? s !== 'archived'
      : filter === '待练' ? (s === 'new' || s === 'practice')
      : filter === '练习中' ? s === 'practice'
      : filter === '已掌握' ? s === 'mastered'
      : filter === '已归档' ? s === 'archived'
      : p.tag === filter && s !== 'archived';
    return inFilter && cur(p).text.toLowerCase().includes(query.toLowerCase());
  }), [phrases, filter, query]);
  const tags = ['全部', '待练', '已掌握', '已归档', ...Array.from(new Set(active.map(p => p.tag)))];

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(phrases)); }, [phrases]);
  useEffect(() => { localStorage.setItem(STORE_KEY + '-selected', selected); }, [selected]);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const stopTimer = () => { window.clearInterval(timer.current); setRecording(false); };
  const selectPhrase = (id: string) => { stopTimer(); setSelected(id); setRecorded(false); setSeconds(0); };

  const startRecord = () => {
    if (!current || current.archivedAt) return;
    if (recording) {
      stopTimer();
      setRecorded(true);
      setScore(58 + Math.round(Math.random() * 40));
      setRecordDay(dayAgo(0));
      return;
    }
    setSeconds(0);
    setRecorded(false);
    setRecording(true);
    timer.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
  };

  const saveRecord = () => {
    if (!current) return;
    const record: PracticeRecord = { id: uid(), day: recordDay || dayAgo(0), score: Math.max(0, Math.min(100, Math.round(score))), seconds, createdAt: Date.now() };
    setPhrases(ps => ps.map(p => p.id !== current.id ? p : { ...p, versions: p.versions.map(v => v.id === p.currentVersionId ? withMastery({ ...v, records: [...v.records, record] }) : v) }));
    setRecorded(false);
    setSeconds(0);
  };

  const addPhrase = () => {
    if (!newText.trim()) return;
    const v: Version = { id: uid(), no: 1, text: newText.trim(), translation: newTrans.trim() || '待补充译文', note: '初始版本', createdAt: Date.now(), records: [], masteredAt: null };
    const p: Phrase = { id: uid(), tag: '自定义', level: '入门', createdAt: Date.now(), versions: [v], currentVersionId: v.id, archivedAt: null, archiveReason: '' };
    setPhrases(ps => [...ps, p]);
    selectPhrase(p.id);
    setNewText(''); setNewTrans(''); setShowAdd(false);
  };

  const openEdit = () => {
    if (!current) return;
    const c = cur(current);
    setEditText(c.text); setEditTrans(c.translation); setEditNote('');
    setEditing(true);
  };
  // 修改句子：生成新版本，旧版本的录音、得分与掌握状态原样保留
  const saveEdit = () => {
    if (!current || !editText.trim()) return;
    const c = cur(current);
    const v: Version = { id: uid(), no: nextNo(current), text: editText.trim(), translation: editTrans.trim() || c.translation, note: editNote.trim() || '修改句子', createdAt: Date.now(), records: [], masteredAt: null };
    setPhrases(ps => ps.map(p => p.id === current.id ? { ...p, versions: [...p.versions, v], currentVersionId: v.id } : p));
    setEditing(false);
    setRecorded(false);
  };

  const handleArchiveClick = () => {
    if (!current) return;
    if (hasHistory(current)) { setArchiveReason(''); setArchiving(true); }
    else setPhrases(ps => ps.map(p => p.id === current.id ? { ...p, archivedAt: Date.now(), archiveReason: '' } : p));
  };
  // 有历史的句子归档必须填写原因；归档后退出今日待练，记录保留
  const confirmArchive = () => {
    if (!current || (hasHistory(current) && !archiveReason.trim())) return;
    setPhrases(ps => ps.map(p => p.id === current.id ? { ...p, archivedAt: Date.now(), archiveReason: archiveReason.trim() } : p));
    setArchiving(false);
    setArchiveReason('');
  };
  // 恢复：生成新版本重新练习，归档前的版本与记录不被覆盖
  const restore = () => {
    if (!current) return;
    const c = cur(current);
    const v: Version = { id: uid(), no: nextNo(current), text: c.text, translation: c.translation, note: '恢复归档，重新练习', createdAt: Date.now(), records: [], masteredAt: null };
    setPhrases(ps => ps.map(p => p.id === current.id ? { ...p, versions: [...p.versions, v], currentVersionId: v.id, archivedAt: null, archiveReason: '' } : p));
  };

  const masteryHint = (v: Version) => {
    if (v.masteredAt) return `已于 ${fmtTime(v.masteredAt)} 达标掌握`;
    const need: string[] = [];
    const lack = MASTER_DAYS - daysOf(v);
    if (lack > 0) need.push(`还差 ${lack} 个练习日`);
    const latest = latestOf(v);
    if (!latest || latest.score < MASTER_SCORE) need.push(`最新评分需 ≥ ${MASTER_SCORE}`);
    return need.length ? `掌握条件：${need.join('，')}` : '已满足掌握条件';
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Volume2 size={19}/></div><div><strong>声线练习室</strong><span>Pronounce / practice</span></div></div>
      <div className="side-label">我的练习</div>
      <nav>
        <button className={filter === '全部' ? 'side-link active' : 'side-link'} onClick={() => setFilter('全部')}><Mic size={17}/>练习库 <b>{active.length}</b></button>
        <button className={filter === '待练' ? 'side-link active' : 'side-link'} onClick={() => setFilter('待练')}><Clock3 size={17}/>今日待练 <b>{todo.length}</b></button>
        <button className={filter === '已掌握' ? 'side-link active' : 'side-link'} onClick={() => setFilter('已掌握')}><Check size={17}/>已掌握 <b>{masteredCount}</b></button>
        <button className={filter === '已归档' ? 'side-link active' : 'side-link'} onClick={() => setFilter('已归档')}><Archive size={17}/>已归档 <b>{archivedCount}</b></button>
      </nav>
      <div className="sidebar-foot">
        <div className="streak"><span>今日待练</span><strong>{todo.length} <small>句</small></strong><i>掌握需跨 {MASTER_DAYS} 日且评分 ≥ {MASTER_SCORE}</i></div>
        <div className="profile"><div className="avatar">YL</div><div><strong>Yuki Lin</strong><span>普通计划</span></div><ChevronRight size={16}/></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div><p className="eyebrow">{today}</p><h1>今天练什么？</h1></div>
        <div className="top-actions">
          <div className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索句子"/></div>
          <button className="primary" onClick={() => setShowAdd(true)}><Plus size={17}/>添加句子</button>
        </div>
      </header>
      <section className="stats">
        <div><span>今日待练</span><strong>{todo.length} <em>/ {active.length} 句</em></strong><div className="progress"><i style={{ width: `${active.length ? Math.round(masteredCount / active.length * 100) : 0}%` }}/></div></div>
        <div><span>已掌握</span><strong>{masteredCount} <em>句</em></strong><small>跨 {MASTER_DAYS} 个练习日且最新评分 ≥ {MASTER_SCORE}</small></div>
        <div><span>累计练习</span><strong>{totalRecords} <em>次</em></strong><small className="green">今天 {todayRecords} 次</small></div>
      </section>
      <div className="content-grid">
        <section className="library">
          <div className="section-head"><div><h2>句子库</h2><p>选择一句开始你的声音训练</p></div><button className="ghost" onClick={() => setFilter('待练')}>只看待练</button></div>
          <div className="filters">{tags.map(t => <button key={t} className={filter === t ? 'chip active' : 'chip'} onClick={() => setFilter(t)}>{t}</button>)}</div>
          <div className="phrase-list">
            {filtered.map(p => {
              const c = cur(p);
              const s = statusOf(p);
              const latest = latestOf(c);
              return <button key={p.id} onClick={() => selectPhrase(p.id)} className={p.id === current?.id ? 'phrase selected' : 'phrase'}>
                <div className="phrase-icon">{s === 'mastered' ? <Check size={15}/> : s === 'archived' ? <Archive size={14}/> : <Mic size={15}/>}</div>
                <div className="phrase-copy">
                  <strong>{c.text}</strong>
                  <span>{c.translation}</span>
                  <div className="phrase-meta">
                    <i>{p.tag}</i><i>{p.level}</i><i>v{c.no}</i>
                    {c.records.length > 0 && <small>{daysOf(c)} 天练习{latest ? ` · 最新 ${latest.score} 分` : ''}</small>}
                    {p.versions.length > 1 && <small>{p.versions.length} 个版本</small>}
                  </div>
                </div>
                <span className={`badge b-${s}`}>{STATUS_LABEL[s]}</span>
              </button>;
            })}
            {filtered.length === 0 && <div className="empty">没有找到匹配句子</div>}
          </div>
        </section>
        {current && <section className="practice">
          <div className="practice-head">
            <div><span className="label">CURRENT PHRASE · v{cur(current).no}</span><h2>跟着感觉读</h2></div>
            {!current.archivedAt && <div className="head-actions">
              <button className="icon-btn" onClick={openEdit} title="修改句子（生成新版本）"><Edit3 size={17}/></button>
              <button className="icon-btn" onClick={handleArchiveClick} title="归档句子"><Archive size={17}/></button>
            </div>}
          </div>
          {current.archivedAt && <div className="archive-banner">
            <Archive size={16}/>
            <div><strong>已于 {fmtTime(current.archivedAt)} 归档</strong><span>原因：{current.archiveReason || '未填写'} · 历史记录已保留</span></div>
            <button className="secondary" onClick={restore}><ArchiveRestore size={14}/>恢复练习</button>
          </div>}
          <div className="focus-card">
            <div className="focus-tag">{current.tag} · {current.level} · v{cur(current).no}</div>
            <p className="focus-text">{cur(current).text}</p>
            <p className="focus-translation">{cur(current).translation}</p>
            <div className="focus-meta">
              <span className={`badge b-${statusOf(current)}`}>{STATUS_LABEL[statusOf(current)]}</span>
              <span className="focus-progress">{masteryHint(cur(current))}</span>
            </div>
            <div className="audio-sample">
              <button className="round-btn" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
              <div className="sample-wave">{bars.map((h, i) => <i key={i} style={{ height: `${h * (playing ? 1.15 : 0.72)}%` }}/>)}</div>
              <span>0:08</span>
            </div>
          </div>
          {!current.archivedAt && <div className="record-card">
            <div className="record-top">
              <div><span className="label">YOUR RECORDING</span><h3>{recorded ? '录音完成，确认本次成绩' : '准备好后开始录音'}</h3></div>
              <span className="record-time">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span>
            </div>
            <div className="record-wave">{bars.slice(5, 58).map((h, i) => <i key={i} className={recording ? 'live' : ''} style={{ height: `${h * (recording ? (0.4 + ((i % 5) / 7)) : 0.4)}%` }}/>)}</div>
            <div className="record-actions">
              <button className={recording ? 'record-button recording' : 'record-button'} onClick={startRecord}><span>{recording ? <Pause size={16}/> : <Mic size={16}/>}</span>{recording ? '结束录音' : recorded ? '重新录音' : '开始录音'}</button>
              {recorded && <button className="secondary" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15}/> : <Play size={15}/>} 回放</button>}
            </div>
            {recorded && <div className="save-panel">
              <div className="save-row">
                <span className="score-preview">{score}<small> 分</small></span>
                <label>得分<input type="number" min={0} max={100} value={score} onChange={e => setScore(Number(e.target.value))}/></label>
                <label>练习日期<input type="date" max={dayAgo(0)} value={recordDay} onChange={e => setRecordDay(e.target.value)}/></label>
              </div>
              <div className="save-row">
                <button className="primary" onClick={saveRecord}><Check size={15}/>保存练习记录</button>
                <button className="secondary" onClick={() => { setRecorded(false); setSeconds(0); }}>丢弃</button>
                <span className="hint-inline">记录计入当前版本 v{cur(current).no}</span>
              </div>
            </div>}
          </div>}
          <div className="history">
            <div className="history-head"><h3><History size={14}/> 版本历史与练习记录</h3><span>{current.versions.length} 个版本</span></div>
            {[...current.versions].sort((a, b) => b.no - a.no).map(v => {
              const latest = latestOf(v);
              return <div key={v.id} className={v.id === current.currentVersionId ? 'version-item current' : 'version-item'}>
                <div className="version-head">
                  <span className="v-badge">v{v.no}</span>
                  <strong>{v.text}</strong>
                  {v.id === current.currentVersionId ? <span className="v-flag now">当前版本</span> : v.masteredAt ? <span className="v-flag mastered">曾掌握</span> : <span className="v-flag">历史版本</span>}
                </div>
                <p className="version-note">{v.note} · {fmtTime(v.createdAt)} · {v.records.length} 次练习{latest ? ` · 最新 ${latest.score} 分` : ''}{v.masteredAt ? ' · 已掌握' : ''}</p>
                {v.records.length > 0 && <div className="record-rows">{sortedRecords(v).map(r => <span key={r.id} className="record-row"><i>{dayLabel(r.day)}</i><b className={r.score >= MASTER_SCORE ? 'good' : ''}>{r.score} 分</b><em>{r.seconds}s</em></span>)}</div>}
              </div>;
            })}
          </div>
          <div className="tip"><span>练习小贴士</span><p>放慢速度，先把每个音节读清楚，再自然地连起来。</p><RotateCcw size={15}/></div>
        </section>}
      </div>
    </main>
    {showAdd && <div className="modal-backdrop" onClick={() => setShowAdd(false)}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2>添加练习句子</h2><button className="icon-btn" onClick={() => setShowAdd(false)}>×</button></div>
      <label>英文句子<textarea autoFocus value={newText} onChange={e => setNewText(e.target.value)} placeholder="例如：I can make this happen."/></label>
      <label>中文译文（可选）<input value={newTrans} onChange={e => setNewTrans(e.target.value)} placeholder="我来让这件事发生。"/></label>
      <div className="modal-actions"><button className="secondary" onClick={() => setShowAdd(false)}>取消</button><button className="primary" onClick={addPhrase} disabled={!newText.trim()}>加入句子库</button></div>
    </div></div>}
    {editing && current && <div className="modal-backdrop" onClick={() => setEditing(false)}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2>修改句子</h2><button className="icon-btn" onClick={() => setEditing(false)}>×</button></div>
      <p className="modal-tip">保存后将生成新版本 v{nextNo(current)}，v{cur(current).no} 的录音、得分与掌握状态会保留在版本历史中，新版本重新计入今日待练。</p>
      <label>英文句子<textarea autoFocus value={editText} onChange={e => setEditText(e.target.value)}/></label>
      <label>中文译文<input value={editTrans} onChange={e => setEditTrans(e.target.value)}/></label>
      <label>修改说明（可选）<input value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="例如：替换更自然的表达"/></label>
      <div className="modal-actions"><button className="secondary" onClick={() => setEditing(false)}>取消</button><button className="primary" onClick={saveEdit} disabled={!editText.trim()}>生成新版本</button></div>
    </div></div>}
    {archiving && current && <div className="modal-backdrop" onClick={() => setArchiving(false)}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2>归档句子</h2><button className="icon-btn" onClick={() => setArchiving(false)}>×</button></div>
      <p className="modal-tip">该句子已有 {current.versions.length} 个版本、{current.versions.reduce((n, v) => n + v.records.length, 0)} 次练习记录。归档后退出今日待练，历史记录保留，需填写归档原因。</p>
      <label>归档原因<textarea autoFocus value={archiveReason} onChange={e => setArchiveReason(e.target.value)} placeholder="例如：最近先集中练元音，之后再回来"/></label>
      <div className="modal-actions"><button className="secondary" onClick={() => setArchiving(false)}>取消</button><button className="primary" onClick={confirmArchive} disabled={!archiveReason.trim()}>确认归档</button></div>
    </div></div>}
  </div>;
}
