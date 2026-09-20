import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Check, ChevronRight, Clock3, History, Mic, Pause, Pencil, Play, Plus, RotateCcw, Search, Volume2 } from 'lucide-react';

/* ---------- 数据模型：句子 / 版本 / 练习记录 ---------- */
type Level = '入门' | '进阶' | '挑战';
type Status = 'new' | 'practice' | 'mastered' | 'archived';

type PracticeRecord = { id: number; score: number; day: string; at: string; seconds: number };
type Version = { id: number; n: number; text: string; translation: string; day: string; at: string; records: PracticeRecord[] };
type Phrase = {
  id: number;
  tag: string;
  level: Level;
  versions: Version[];
  currentId: number;
  archived: { reason: string; day: string; at: string } | null;
};

const MASTER_SCORE = 85; // 最新评分达标线
const MASTER_DAYS = 2;   // 需要跨天练习的天数
const STORE_KEY = 'sound-lab-phrases-v2';

/* ---------- 日期工具 ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowStamp = () => { const d = new Date(); return { day: dayOf(d), at: `${pad(d.getHours())}:${pad(d.getMinutes())}` }; };
const dayLabel = (day: string) => {
  if (day === dayOf(new Date())) return '今天';
  if (day === dayOf(new Date(Date.now() - 864e5))) return '昨天';
  const [, m, d] = day.split('-');
  return `${Number(m)}月${Number(d)}日`;
};

let uidSeq = Date.now();
const uid = () => ++uidSeq;

/* ---------- 领域规则 ---------- */
const currentVersion = (p: Phrase) => p.versions.find(v => v.id === p.currentId) ?? p.versions[p.versions.length - 1];
const daysPracticed = (v: Version) => new Set(v.records.map(r => r.day)).size;
const latestOf = (v: Version) => v.records[v.records.length - 1];
// 掌握判定绑定在“版本”上：同一版本跨两日练习且最新评分达标
const isMastered = (v: Version) => daysPracticed(v) >= MASTER_DAYS && (latestOf(v)?.score ?? 0) >= MASTER_SCORE;
const statusOf = (p: Phrase): Status => {
  if (p.archived) return 'archived';
  const v = currentVersion(p);
  if (isMastered(v)) return 'mastered';
  return v.records.length > 0 || p.versions.length > 1 ? 'practice' : 'new';
};
const inQueue = (p: Phrase) => { const s = statusOf(p); return s !== 'archived' && s !== 'mastered'; };
const hasHistory = (p: Phrase) => p.versions.length > 1 || p.versions.some(v => v.records.length > 0);

const statusMeta: Record<Status, { label: string; cls: string }> = {
  new: { label: '新句子', cls: 'st-new' },
  practice: { label: '练习中', cls: 'st-practice' },
  mastered: { label: '已掌握', cls: 'st-mastered' },
  archived: { label: '已归档', cls: 'st-archived' },
};

/* ---------- 示例数据（日期相对今天生成，便于演示跨日规则） ---------- */
function buildSeed(): Phrase[] {
  const today = dayOf(new Date());
  const yesterday = dayOf(new Date(Date.now() - 864e5));
  let rid = 0, vid = 0, pid = 0;
  const R = (score: number, day: string, at: string, seconds: number): PracticeRecord => ({ id: ++rid, score, day, at, seconds });
  const V = (n: number, text: string, translation: string, day: string, at: string, records: PracticeRecord[]): Version => ({ id: ++vid, n, text, translation, day, at, records });
  const P = (tag: string, level: Level, versions: Version[], archived: Phrase['archived'] = null): Phrase =>
    ({ id: ++pid, tag, level, versions, currentId: versions[versions.length - 1].id, archived });
  return [
    // 昨天练过两次，今天再练一次且 ≥85 即可掌握
    P('日常', '入门', [V(1, 'The morning light feels different today.', '今天的晨光感觉不一样。', yesterday, '09:20', [R(78, yesterday, '09:20', 6), R(84, yesterday, '09:24', 7)])]),
    P('工作', '进阶', [V(1, 'Could you walk me through the next step?', '你能带我了解下一步吗？', today, '08:02', [])]),
    // 已掌握：跨两天且最新 92 分；修改它会生成 v2 并回到练习中
    P('表达', '挑战', [V(1, 'I appreciate your patience and thoughtful feedback.', '感谢你的耐心和细致反馈。', yesterday, '18:06', [R(81, yesterday, '18:06', 8), R(86, yesterday, '18:10', 9), R(92, today, '08:41', 8)])]),
    // v1 曾掌握，修改后生成 v2，旧记录留在 v1，当前回到练习中
    P('灵感', '入门', [
      V(1, "Let's make room for curiosity.", '给好奇心留点位置。', yesterday, '10:09', [R(83, yesterday, '10:09', 5), R(88, today, '07:58', 6)]),
      V(2, 'Let’s make room for a little curiosity.', '给好奇心留一点空间。', today, '09:15', [R(76, today, '09:16', 5)]),
    ]),
    // 已归档：有历史记录，归档填了原因并退出今日待练
    P('自定义', '入门', [V(1, 'I’ll figure it out as I go.', '我会边走边想办法。', yesterday, '15:40', [R(72, yesterday, '15:41', 6)])], { reason: '和「灵感」标签下的句子重复，先归档。', day: yesterday, at: '16:02' }),
  ];
}

const load = (): Phrase[] => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const data = JSON.parse(raw); if (Array.isArray(data) && data.length) return data; }
  } catch { /* 数据损坏时回退到示例 */ }
  return buildSeed();
};

const bars = Array.from({ length: 68 }, (_, i) => 18 + ((i * 29) % 44));

export default function App() {
  const [phrases, setPhrases] = useState<Phrase[]>(load);
  const [selected, setSelected] = useState(() => (phrases.find(inQueue) ?? phrases[0])?.id ?? 0);
  const [filter, setFilter] = useState('全部');
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [modal, setModal] = useState<null | 'add' | 'edit' | 'archive' | 'history'>(null);
  const [draftText, setDraftText] = useState('');
  const [draftTranslation, setDraftTranslation] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const current = phrases.find(p => p.id === selected) ?? phrases.find(inQueue) ?? phrases[0];
  const cv = current ? currentVersion(current) : undefined;
  const today = dayOf(new Date());

  const queue = phrases.filter(inQueue);
  const activeCount = phrases.filter(p => !p.archived).length;
  const masteredCount = phrases.filter(p => statusOf(p) === 'mastered').length;
  const archivedCount = phrases.filter(p => p.archived).length;
  const todayRecords = phrases.reduce((n, p) => n + p.versions.reduce((m, v) => m + v.records.filter(r => r.day === today).length, 0), 0);
  const todayVersions = phrases.reduce((n, p) => n + p.versions.filter(v => v.records.some(r => r.day === today)).length, 0);

  const filtered = useMemo(() => phrases.filter(p => {
    const s = statusOf(p);
    const hit =
      filter === '全部' ? !p.archived :
      filter === '待练' ? inQueue(p) :
      filter === '已掌握' ? s === 'mastered' :
      filter === '已归档' ? !!p.archived :
      !p.archived && (p.tag === filter || p.level === filter);
    const v = currentVersion(p);
    const q = query.toLowerCase();
    return hit && (v.text.toLowerCase().includes(q) || v.translation.includes(query));
  }), [phrases, filter, query]);
  const tags = ['全部', ...Array.from(new Set(phrases.map(p => p.tag)))];

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(phrases)); }, [phrases]);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const updatePhrase = (id: number, fn: (p: Phrase) => Phrase) => setPhrases(ps => ps.map(p => p.id === id ? fn(p) : p));
  const selectPhrase = (id: number) => { setSelected(id); setLastScore(null); };

  /* ---------- 录音：每次结束生成一条绑定当前版本的练习记录 ---------- */
  const startRecord = () => {
    if (!current || current.archived) return;
    if (recording) {
      window.clearInterval(timer.current);
      setRecording(false);
      const score = Math.min(98, Math.max(56, Math.round(64 + seconds * 1.6 + Math.random() * 26)));
      const { day, at } = nowStamp();
      const record: PracticeRecord = { id: uid(), score, day, at, seconds };
      updatePhrase(current.id, p => ({ ...p, versions: p.versions.map(v => v.id === p.currentId ? { ...v, records: [...v.records, record] } : v) }));
      setLastScore(score);
      return;
    }
    setLastScore(null);
    setSeconds(0);
    setRecording(true);
    timer.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
  };

  /* ---------- 修改句子：生成新版本，旧版本的录音/得分/掌握状态原样保留 ---------- */
  const openEdit = () => { if (!cv) return; setDraftText(cv.text); setDraftTranslation(cv.translation); setModal('edit'); };
  const saveEdit = () => {
    if (!current || !cv) return;
    const text = draftText.trim();
    const translation = draftTranslation.trim() || '待补充译文';
    if (!text) return;
    if (text === cv.text && translation === cv.translation) { setModal(null); return; }
    const { day, at } = nowStamp();
    const version: Version = { id: uid(), n: Math.max(...current.versions.map(v => v.n)) + 1, text, translation, day, at, records: [] };
    updatePhrase(current.id, p => ({ ...p, versions: [...p.versions, version], currentId: version.id }));
    setLastScore(null);
    setModal(null);
  };

  /* ---------- 归档：有历史的句子必须填原因；归档后退出今日待练 ---------- */
  const confirmArchive = () => {
    if (!current) return;
    const reason = archiveReason.trim();
    if (hasHistory(current) && !reason) return;
    const { day, at } = nowStamp();
    updatePhrase(current.id, p => ({ ...p, archived: { reason: reason || '未填写原因', day, at } }));
    setArchiveReason('');
    setModal(null);
  };

  /* ---------- 恢复：生成新版本继续练，归档前的版本与记录不被覆盖 ---------- */
  const restorePhrase = () => {
    if (!current || !current.archived || !cv) return;
    const { day, at } = nowStamp();
    const version: Version = { id: uid(), n: Math.max(...current.versions.map(v => v.n)) + 1, text: cv.text, translation: cv.translation, day, at, records: [] };
    updatePhrase(current.id, p => ({ ...p, versions: [...p.versions, version], currentId: version.id, archived: null }));
    setLastScore(null);
  };

  const addPhrase = () => {
    const text = draftText.trim();
    if (!text) return;
    const { day, at } = nowStamp();
    const version: Version = { id: uid(), n: 1, text, translation: draftTranslation.trim() || '待补充译文', day, at, records: [] };
    const phrase: Phrase = { id: uid(), tag: '自定义', level: '入门', versions: [version], currentId: version.id, archived: null };
    setPhrases(ps => [...ps, phrase]);
    setSelected(phrase.id);
    setDraftText(''); setDraftTranslation('');
    setModal(null);
  };

  const days = cv ? daysPracticed(cv) : 0;
  const latest = cv ? latestOf(cv) : undefined;
  const mastered = cv ? isMastered(cv) : false;
  const latestOk = (latest?.score ?? 0) >= MASTER_SCORE;
  const topDate = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Volume2 size={19}/></div><div><strong>声线练习室</strong><span>Pronounce / practice</span></div></div>
      <div className="side-label">我的练习</div>
      <nav>
        <button className={filter === '全部' ? 'side-link active' : 'side-link'} onClick={() => setFilter('全部')}><Mic size={17}/>练习库 <b>{activeCount}</b></button>
        <button className={filter === '待练' ? 'side-link active' : 'side-link'} onClick={() => setFilter('待练')}><Clock3 size={17}/>今日待练 <b>{queue.length}</b></button>
        <button className={filter === '已掌握' ? 'side-link active' : 'side-link'} onClick={() => setFilter('已掌握')}><Check size={17}/>已掌握 <b>{masteredCount}</b></button>
        <button className={filter === '已归档' ? 'side-link active' : 'side-link'} onClick={() => setFilter('已归档')}><Archive size={17}/>已归档 <b>{archivedCount}</b></button>
      </nav>
      <div className="sidebar-foot">
        <div className="streak"><span>连续练习</span><strong>5 <small>天</small></strong><i>↗ +2</i></div>
        <div className="profile"><div className="avatar">YL</div><div><strong>Yuki Lin</strong><span>普通计划</span></div><ChevronRight size={16}/></div>
      </div>
    </aside>
    <main className="main">
      <header className="topbar">
        <div><p className="eyebrow">{topDate}</p><h1>今天练什么？</h1></div>
        <div className="top-actions">
          <div className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索句子"/></div>
          <button className="primary" onClick={() => { setDraftText(''); setDraftTranslation(''); setModal('add'); }}><Plus size={17}/>添加句子</button>
        </div>
      </header>
      <section className="stats">
        <div><span>今日待练</span><strong>{queue.length} <em>/ {activeCount} 句</em></strong><div className="progress"><i style={{ width: `${activeCount ? Math.round((activeCount - queue.length) / activeCount * 100) : 0}%` }}/></div></div>
        <div><span>今日练习</span><strong>{todayRecords} <em>次录音</em></strong><small>覆盖 {todayVersions} 个版本</small></div>
        <div><span>已掌握</span><strong>{masteredCount} <em>句</em></strong><small className="green">跨 {MASTER_DAYS} 天 · 最新 ≥{MASTER_SCORE} 分</small></div>
      </section>
      <div className="content-grid">
        <section className="library">
          <div className="section-head"><div><h2>句子库</h2><p>选择一句开始你的声音训练</p></div><button className="ghost" onClick={() => setFilter('待练')}>只看待练</button></div>
          <div className="filters">{tags.map(t => <button key={t} className={filter === t ? 'chip active' : 'chip'} onClick={() => setFilter(t)}>{t}</button>)}</div>
          <div className="phrase-list">
            {filtered.map(p => {
              const v = currentVersion(p);
              const s = statusOf(p);
              const last = latestOf(v);
              return <button key={p.id} onClick={() => selectPhrase(p.id)} className={p.id === current?.id ? 'phrase selected' : 'phrase'}>
                <div className={`phrase-icon ic-${s}`}>{s === 'mastered' ? <Check size={15}/> : s === 'archived' ? <Archive size={15}/> : <Mic size={15}/>}</div>
                <div className="phrase-copy">
                  <strong>{v.text}</strong>
                  <span>{v.translation}</span>
                  <div className="phrase-meta">
                    <i>{p.tag}</i><i>{p.level}</i><i>v{v.n}</i>
                    <em className={`st ${statusMeta[s].cls}`}>{statusMeta[s].label}</em>
                    {v.records.length > 0 && <small>{v.records.length} 次练习 · 最新 {last!.score} 分</small>}
                  </div>
                </div>
                <ChevronRight size={17}/>
              </button>;
            })}
            {filtered.length === 0 && <div className="empty">没有找到匹配句子</div>}
          </div>
        </section>
        {current && cv && <section className="practice">
          <div className="practice-head">
            <div><span className="label">CURRENT PHRASE · V{cv.n}</span><h2>跟着感觉读</h2></div>
            <div className="practice-actions">
              <button className="icon-btn" onClick={() => setModal('history')} title="版本历史"><History size={17}/></button>
              {!current.archived && <button className="icon-btn" onClick={openEdit} title="修改句子（生成新版本）"><Pencil size={17}/></button>}
              {!current.archived && <button className="icon-btn" onClick={() => { setArchiveReason(''); setModal('archive'); }} title="归档句子"><Archive size={17}/></button>}
            </div>
          </div>
          <div className="focus-card">
            <div className="focus-tag">{current.tag} · {current.level}<span className="ver-chip">版本 v{cv.n} / 共 {current.versions.length} 版</span></div>
            <p className="focus-text">{cv.text}</p>
            <p className="focus-translation">{cv.translation}</p>
            <div className="audio-sample"><button className="round-btn" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><div className="sample-wave">{bars.map((h, i) => <i key={i} style={{ height: `${h * (playing ? 1.15 : 0.72)}%` }}/>)}</div><span>0:08</span></div>
          </div>
          {current.archived ? (
            <div className="banner archived">
              <Archive size={16}/>
              <div>
                <b>已归档 · {dayLabel(current.archived.day)} {current.archived.at}</b>
                <p>原因：{current.archived.reason}</p>
                <small>归档前的版本与练习记录已保留，恢复时会生成新版本，不会覆盖。</small>
              </div>
              <button className="primary" onClick={restorePhrase}><ArchiveRestore size={15}/>恢复练习</button>
            </div>
          ) : (
            <>
              {mastered && <div className="banner mastered"><Check size={16}/><div><b>当前版本已掌握</b><p>跨 {days} 天练习，最新评分 {latest?.score} 分。再次修改句子会生成新版本并回到练习中。</p></div></div>}
              <div className="mastery">
                <div className="mastery-head"><span className="label">掌握条件 · 版本 v{cv.n}</span>{mastered ? <b className="ok"><Check size={13}/>已达成</b> : <b>{(days >= MASTER_DAYS ? 1 : 0) + (latestOk ? 1 : 0)} / 2</b>}</div>
                <div className={days >= MASTER_DAYS ? 'rule done' : 'rule'}><i>{days >= MASTER_DAYS ? <Check size={12}/> : Math.min(days, MASTER_DAYS)}</i><p>跨 {MASTER_DAYS} 天完成练习<small>已练 {days} 天{days < MASTER_DAYS ? '，换个日期再练一次' : ''}</small></p></div>
                <div className={latestOk ? 'rule done' : 'rule'}><i>{latestOk ? <Check size={12}/> : latest ? latest.score : '—'}</i><p>最新评分达到 {MASTER_SCORE} 分<small>{latest ? `当前最新 ${latest.score} 分` : '还没有评分，先录一次音'}</small></p></div>
              </div>
              <div className="record-card">
                <div className="record-top">
                  <div><span className="label">YOUR RECORDING</span><h3>{lastScore !== null ? `本次得分 ${lastScore} 分${lastScore >= MASTER_SCORE ? '，已达掌握线' : ''}` : cv.records.length ? '录音已保存，继续冲刺掌握线' : '准备好后开始录音'}</h3></div>
                  <span className="record-time">{pad(Math.floor(seconds / 60))}:{pad(seconds % 60)}</span>
                </div>
                <div className="record-wave">{bars.slice(5, 58).map((h, i) => <i key={i} className={recording ? 'live' : ''} style={{ height: `${h * (recording ? (0.4 + ((i % 5) / 7)) : 0.4)}%` }}/>)}</div>
                <div className="record-actions">
                  <button className={recording ? 'record-button recording' : 'record-button'} onClick={startRecord}><span>{recording ? <Pause size={16}/> : <Mic size={16}/>}</span>{recording ? '结束录音' : cv.records.length ? '再录一次' : '开始录音'}</button>
                  {cv.records.length > 0 && <button className="secondary" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15}/> : <Play size={15}/>} 回放</button>}
                </div>
              </div>
              {cv.records.length > 0 && <div className="record-list">
                {[...cv.records].reverse().slice(0, 4).map(r => (
                  <div className="record-row" key={r.id}>
                    <span className={r.score >= MASTER_SCORE ? 'score good' : 'score'}>{r.score}</span>
                    <div><b>{dayLabel(r.day)} {r.at}</b><small>录音 {r.seconds} 秒</small></div>
                    {r.score >= MASTER_SCORE && <em>达标</em>}
                  </div>
                ))}
              </div>}
            </>
          )}
          <div className="tip"><span>练习小贴士</span><p>放慢速度，先把每个音节读清楚，再自然地连起来。</p><RotateCcw size={15}/></div>
        </section>}
      </div>
    </main>

    {modal === 'add' && <div className="modal-backdrop" onClick={() => setModal(null)}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2>添加练习句子</h2><button className="icon-btn" onClick={() => setModal(null)}>×</button></div>
      <label>英文句子<textarea autoFocus value={draftText} onChange={e => setDraftText(e.target.value)} placeholder="例如：I can make this happen."/></label>
      <label>中文译文<input value={draftTranslation} onChange={e => setDraftTranslation(e.target.value)} placeholder="例如：我能把这件事做成。"/></label>
      <div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>取消</button><button className="primary" onClick={addPhrase}>加入句子库</button></div>
    </div></div>}

    {modal === 'edit' && current && cv && <div className="modal-backdrop" onClick={() => setModal(null)}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2>修改句子</h2><button className="icon-btn" onClick={() => setModal(null)}>×</button></div>
      <label>英文句子<textarea autoFocus value={draftText} onChange={e => setDraftText(e.target.value)}/></label>
      <label>中文译文<input value={draftTranslation} onChange={e => setDraftTranslation(e.target.value)}/></label>
      <p className="modal-hint">保存后生成新版本 v{Math.max(...current.versions.map(v => v.n)) + 1}；v{cv.n} 的录音、得分与掌握状态仍归旧版本。{mastered ? '当前版本已掌握，修改后将回到练习中。' : ''}</p>
      <div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>取消</button><button className="primary" onClick={saveEdit} disabled={!draftText.trim()}>保存为新版本</button></div>
    </div></div>}

    {modal === 'archive' && current && cv && <div className="modal-backdrop" onClick={() => setModal(null)}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2>归档句子</h2><button className="icon-btn" onClick={() => setModal(null)}>×</button></div>
      <p className="modal-sub">「{cv.text}」</p>
      {hasHistory(current) && <p className="modal-warn">该句子已有 {current.versions.reduce((n, v) => n + v.records.length, 0)} 次练习记录、{current.versions.length} 个版本，归档需填写原因。</p>}
      <label>归档原因{hasHistory(current) ? '（必填）' : '（可选）'}<textarea autoFocus value={archiveReason} onChange={e => setArchiveReason(e.target.value)} placeholder="例如：和另一句重复 / 暂时不练这句"/></label>
      <p className="modal-hint">归档后退出今日待练；版本历史、录音与得分全部保留，可随时恢复。</p>
      <div className="modal-actions"><button className="secondary" onClick={() => setModal(null)}>取消</button><button className="primary" onClick={confirmArchive} disabled={hasHistory(current) && !archiveReason.trim()}>确认归档</button></div>
    </div></div>}

    {modal === 'history' && current && <div className="modal-backdrop" onClick={() => setModal(null)}><div className="modal wide" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><h2>版本历史 · 共 {current.versions.length} 版</h2><button className="icon-btn" onClick={() => setModal(null)}>×</button></div>
      <div className="history-list">
        {[...current.versions].sort((a, b) => b.n - a.n).map(v => (
          <div key={v.id} className={v.id === current.currentId ? 'ver current' : 'ver'}>
            <div className="ver-head">
              <b>v{v.n}</b>
              <span>{dayLabel(v.day)} {v.at} 创建</span>
              {v.id === current.currentId && <i className="tag-now">当前版本</i>}
              {isMastered(v) && <i className="tag-ok">已掌握</i>}
            </div>
            <p className="ver-text">{v.text}</p>
            <div className="ver-records">
              {v.records.length === 0 ? <span>暂无练习记录</span> : v.records.map(r => <span key={r.id} className={r.score >= MASTER_SCORE ? 'hit' : ''}>{dayLabel(r.day)} {r.at} · {r.score} 分</span>)}
            </div>
          </div>
        ))}
      </div>
    </div></div>}
  </div>;
}
