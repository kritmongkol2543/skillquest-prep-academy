"use client";

import { useEffect, useMemo, useState } from "react";

type View = "profile" | "ranking" | "exam";
type QuestionState = "not_started" | "viewed" | "paused" | "answered" | "changed_answer" | "reviewed";

const subjects = [
  { name: "ภาษาอังกฤษ", short: "EN", mastery: 88, rank: "Diamond", color: "#22d3ee" },
  { name: "ภาษาไทย", short: "TH", mastery: 82, rank: "Platinum", color: "#a78bfa" },
  { name: "สังคมศึกษา", short: "SO", mastery: 79, rank: "Platinum", color: "#f472b6" },
  { name: "คณิตศาสตร์", short: "MA", mastery: 74, rank: "Gold", color: "#fbbf24" },
  { name: "วิทยาศาสตร์", short: "SC", mastery: 68, rank: "Gold", color: "#34d399" },
];

const questions = [
  { q: "ถ้า 3x + 7 = 22 แล้ว x มีค่าเท่าใด?", choices: ["3", "5", "7", "9"], answer: 1 },
  { q: "จำนวนใดเป็นจำนวนเฉพาะ?", choices: ["21", "27", "29", "33"], answer: 2 },
  { q: "พื้นที่ของสี่เหลี่ยมจัตุรัสด้านยาว 8 ซม. เท่ากับเท่าใด?", choices: ["16 ตร.ซม.", "32 ตร.ซม.", "64 ตร.ซม.", "80 ตร.ซม."], answer: 2 },
  { q: "3/4 เขียนเป็นทศนิยมได้ข้อใด?", choices: ["0.25", "0.50", "0.75", "1.25"], answer: 2 },
  { q: "ค่าเฉลี่ยของ 6, 8 และ 10 เท่ากับเท่าใด?", choices: ["7", "8", "9", "10"], answer: 1 },
  { q: "มุมตรงมีขนาดกี่องศา?", choices: ["45°", "90°", "180°", "360°"], answer: 2 },
  { q: "2⁵ มีค่าเท่าใด?", choices: ["10", "16", "25", "32"], answer: 3 },
  { q: "จำนวนถัดไปของ 2, 4, 8, 16 คือข้อใด?", choices: ["18", "24", "30", "32"], answer: 3 },
  { q: "รากที่สองของ 144 คือข้อใด?", choices: ["10", "11", "12", "14"], answer: 2 },
  { q: "15% ของ 200 เท่ากับเท่าใด?", choices: ["15", "20", "30", "45"], answer: 2 },
];

const leaders = [
  { name: "Phupha", points: "14,920", growth: "+18%", rank: "Legend", avatar: "P" },
  { name: "Nina", points: "13,870", growth: "+14%", rank: "Grandmaster", avatar: "N" },
  { name: "Boss", points: "12,450", growth: "+12%", rank: "Platinum", avatar: "B", me: true },
  { name: "Mild", points: "11,930", growth: "+11%", rank: "Platinum", avatar: "M" },
  { name: "Ton", points: "10,840", growth: "+9%", rank: "Gold", avatar: "T" },
];

const history = [
  { date: "10 ก.ค. 2026", subject: "คณิตศาสตร์", set: "Math Challenge 04", score: "42/50", accuracy: "84%", time: "28:16", rank: "Platinum", tone: "success" },
  { date: "8 ก.ค. 2026", subject: "ภาษาอังกฤษ", set: "English Sprint 08", score: "46/50", accuracy: "92%", time: "21:44", rank: "Diamond", tone: "success" },
  { date: "5 ก.ค. 2026", subject: "วิทยาศาสตร์", set: "Science Core 03", score: "—", accuracy: "ยกเลิก", time: "08:32", rank: "ไม่นับอันดับ", tone: "cancelled" },
];

function formatTime(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [view, setView] = useState<View>("profile");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({ 0: 1, 1: 2, 3: 2 });
  const [states, setStates] = useState<Record<number, QuestionState>>({ 0: "answered", 1: "answered", 2: "paused", 3: "answered", 4: "viewed" });
  const [seconds, setSeconds] = useState(847);
  const [running, setRunning] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState("ภาพรวม");
  const [jump, setJump] = useState("");
  const [saved, setSaved] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const remaining = questions.length - answeredCount;

  useEffect(() => {
    const raw = localStorage.getItem("skillquest-attempt");
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setAnswers(data.answers ?? {});
        setStates(data.states ?? {});
        setCurrent(data.current ?? 0);
        setSeconds(data.seconds ?? 0);
        setResumeOpen(data.status === "paused");
      } catch { /* ignore invalid demo data */ }
    }
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    const payload = { answers, states, current, seconds, status: running ? "in_progress" : "paused" };
    localStorage.setItem("skillquest-attempt", JSON.stringify(payload));
    setSaved(true);
    const t = window.setTimeout(() => setSaved(false), 900);
    return () => window.clearTimeout(t);
  }, [answers, states, current, seconds, running]);

  const radarValues = useMemo(() => subjectFilter === "ภาพรวม" ? [86, 78, 82, 80, 74, 88] : [90, 84, 76, 88, 81, 92], [subjectFilter]);
  const radarPolygon = radarValues.map((v, i) => {
    const angle = (Math.PI * 2 * i) / radarValues.length - Math.PI / 2;
    const radius = v * 0.46;
    return `${50 + Math.cos(angle) * radius}% ${50 + Math.sin(angle) * radius}%`;
  }).join(",");

  function goTo(index: number) {
    setStates((prev) => ({
      ...prev,
      [current]: answers[current] !== undefined ? (prev[current] === "answered" ? "answered" : "reviewed") : "paused",
      [index]: answers[index] !== undefined ? "reviewed" : "viewed",
    }));
    setCurrent(index);
  }

  function choose(choice: number) {
    const changed = answers[current] !== undefined && answers[current] !== choice;
    setAnswers((prev) => ({ ...prev, [current]: choice }));
    setStates((prev) => ({ ...prev, [current]: changed ? "changed_answer" : "answered" }));
  }

  function cancelAttempt() {
    localStorage.removeItem("skillquest-attempt");
    setResumeOpen(false);
    setRunning(false);
    setView("profile");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("profile")} aria-label="SkillQuest หน้าหลัก">
          <span className="brand-mark">S</span>
          <span><b>SkillQuest</b><small>TRAIN • GROW • MASTER</small></span>
        </button>
        <nav aria-label="เมนูหลัก">
          <p className="nav-label">PLAYER HUB</p>
          <button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}><Icon>◫</Icon> โปรไฟล์ของฉัน</button>
          <button className={view === "ranking" ? "active" : ""} onClick={() => setView("ranking")}><Icon>♜</Icon> อันดับผู้เล่น</button>
          <button className={view === "exam" ? "active" : ""} onClick={() => { setView("exam"); setRunning(true); }}><Icon>✦</Icon> ทำแบบทดสอบ</button>
          <p className="nav-label">PROGRESS</p>
          <button onClick={() => setView("profile")}><Icon>◷</Icon> ประวัติการสอบ</button>
          <button onClick={() => setView("profile")}><Icon>◇</Icon> ความชำนาญ</button>
        </nav>
        <div className="sidebar-card">
          <div className="mini-rank">◆</div>
          <div><small>CURRENT TIER</small><strong>Platinum III</strong><span>อีก 550 แต้มสู่ Diamond</span></div>
          <div className="xp"><i style={{ width: "72%" }} /></div>
        </div>
        <div className="user-chip"><span className="avatar">B</span><div><b>Boss</b><small>Level 24</small></div><button aria-label="ตั้งค่า">•••</button></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">S</span><b>SkillQuest</b></div>
          <div className="top-stats"><span><b>🔥 12</b> วันต่อเนื่อง</span><span><b>⚡ 12,450</b> คะแนนรวม</span></div>
          <div className="top-actions"><button aria-label="การแจ้งเตือน">●</button><span className="avatar small">B</span></div>
        </header>

        {view === "profile" && (
          <div className="page profile-page">
            <div className="page-heading"><div><p className="eyebrow">PLAYER PROFILE</p><h1>ยินดีต้อนรับกลับ, Boss <span>✦</span></h1><p>ทุกชุดข้อสอบกำลังเพิ่มค่าสเตตัสของคุณ — ไปให้ถึง Diamond กัน</p></div><button className="primary" onClick={() => { setView("exam"); setRunning(true); }}>เริ่มฝึกวันนี้ <span>→</span></button></div>

            <section className="hero-grid">
              <article className="player-card panel">
                <div className="card-glow" />
                <div className="player-top"><div className="portrait"><span>B</span><i>24</i></div><div><span className="online">● ONLINE</span><h2>Boss</h2><p>THE KNOWLEDGE SEEKER</p></div><div className="tier-gem">◆<small>PLATINUM</small></div></div>
                <div className="level-row"><span>LEVEL 24</span><b>8,450 / 10,000 XP</b></div><div className="level-bar"><i /></div>
                <div className="player-stats"><div><span>12,450</span><small>TOTAL POINTS</small></div><div><span>24</span><small>TESTS CLEARED</small></div><div><span>12 🔥</span><small>DAY STREAK</small></div></div>
                <div className="achievement"><span>★</span><div><small>BEST SUBJECT</small><b>ภาษาอังกฤษ • 88% Mastery</b></div><em>Diamond</em></div>
              </article>

              <article className="radar-card panel">
                <div className="section-title"><div><p className="eyebrow">CORE STATS</p><h3>Skill Radar</h3></div><select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} aria-label="เลือกวิชาสำหรับกราฟ"><option>ภาพรวม</option><option>ภาษาอังกฤษ</option></select></div>
                <div className="radar-wrap">
                  <div className="radar">
                    <div className="radar-grid g1" /><div className="radar-grid g2" /><div className="radar-grid g3" />
                    <div className="radar-data" style={{ clipPath: `polygon(${radarPolygon})` }} />
                    {[["ACCURACY",50,0],["SPEED",91,25],["FOCUS",91,76],["GROWTH",50,100],["KNOWLEDGE",4,76],["CONSISTENCY",4,25]].map(([label,x,y]) => <span key={String(label)} style={{ left: `${x}%`, top: `${y}%` }}>{label}</span>)}
                  </div>
                  <div className="radar-score"><b>82</b><span>OVERALL</span><small>+6 จากเดือนก่อน</small></div>
                </div>
              </article>
            </section>

            <section className="content-grid">
              <article className="panel mastery-card">
                <div className="section-title"><div><p className="eyebrow">SUBJECT MASTERY</p><h3>ค่าสเตตัสรายวิชา</h3></div><button>ดูทั้งหมด →</button></div>
                <div className="subject-list">{subjects.map((s) => <div className="subject-row" key={s.name}><span className="subject-icon" style={{ color: s.color, borderColor: `${s.color}55`, background: `${s.color}10` }}>{s.short}</span><div className="subject-progress"><div><b>{s.name}</b><em>{s.mastery}%</em></div><div className="progress"><i style={{ width: `${s.mastery}%`, background: s.color }} /></div></div><span className={`rank-pill ${s.rank.toLowerCase()}`}>{s.rank}</span></div>)}</div>
              </article>

              <article className="panel speed-card">
                <div className="section-title"><div><p className="eyebrow">PERSONAL RECORD</p><h3>High Speed</h3></div><span className="record-icon">⚡</span></div>
                <div className="speed-time"><b>18:42</b><span>นาที</span></div><p>เวลาที่ดีที่สุด • คณิตศาสตร์</p>
                <div className="speed-meta"><div><small>SCORE</small><b>41 / 50</b></div><div><small>ACCURACY</small><b>82%</b></div></div>
                <div className="set-name"><span>Math Set 01</span><small>10 ก.ค. 2026</small></div><p className="quality-note">✓ ผ่านเกณฑ์ High Speed คุณภาพ (Accuracy ≥ 70%)</p>
              </article>
            </section>

            <section className="panel history-card">
              <div className="section-title"><div><p className="eyebrow">RECENT ATTEMPTS</p><h3>ประวัติการสอบล่าสุด</h3></div><div className="legend"><span><i className="ok" /> ส่งสำเร็จ</span><span><i className="cancel" /> ยกเลิก</span></div></div>
              <div className="history-table"><div className="history-head"><span>วันที่</span><span>แบบทดสอบ</span><span>คะแนน</span><span>ความแม่นยำ</span><span>Active Time</span><span>Rank หลังสอบ</span><span /></div>{history.map((h) => <div className={`history-row ${h.tone}`} key={h.set}><span>{h.date}</span><span><b>{h.subject}</b><small>{h.set}</small></span><span>{h.score}</span><span>{h.accuracy}</span><span>{h.time}</span><span className="history-rank">{h.rank}</span><button aria-label={`ดูรายละเอียด ${h.set}`}>→</button></div>)}</div>
            </section>
          </div>
        )}

        {view === "ranking" && (
          <div className="page ranking-page">
            <div className="page-heading"><div><p className="eyebrow">GAME RANKING</p><h1>Leaderboard <span>♜</span></h1><p>อันดับที่สะท้อนทั้งความแม่นยำ ความเร็ว ความสม่ำเสมอ และพัฒนาการ</p></div><div className="season"><small>SEASON ENDS IN</small><b>12 วัน 08:42:19</b></div></div>
            <section className="rank-hero panel"><div><span className="rank-emblem">◆</span><p>YOUR CURRENT RANK</p><h2>Platinum III</h2><span>อันดับ #3 ของกลุ่ม • Top 12%</span></div><div className="rank-progress"><div><span>12,450 RP</span><b>550 RP to Diamond</b></div><div className="progress"><i style={{ width: "72%" }} /></div><div className="rank-factors"><span><b>+84</b> Accuracy</span><span><b>+62</b> Speed</span><span><b>+48</b> Growth</span><span><b>+40</b> Consistency</span></div></div></section>
            <section className="panel leaderboard"><div className="section-title"><div><p className="eyebrow">TOP PLAYERS</p><h3>อันดับประจำสัปดาห์</h3></div><div className="segmented"><button className="active">ทั้งหมด</button><button>เพื่อน</button><button>ชั้นเรียน</button></div></div>
              <div className="leader-list">{leaders.map((l, i) => <div className={`leader-row ${l.me ? "me" : ""}`} key={l.name}><span className={`position p${i+1}`}>{i+1}</span><span className="avatar">{l.avatar}</span><span className="leader-name"><b>{l.name}{l.me && " (คุณ)"}</b><small>{l.rank}</small></span><span className="growth">↗ {l.growth}</span><span className="leader-points"><b>{l.points}</b><small>RANKING POINTS</small></span><span className="tier-dot">◆</span></div>)}</div>
            </section>
            <section className="formula-grid"><article className="panel"><p className="eyebrow">HOW IT WORKS</p><h3>คะแนนอันดับของคุณ</h3><p>ไม่ได้วัดจากคะแนนดิบอย่างเดียว ระบบให้รางวัลกับคนที่เก่งขึ้นอย่างต่อเนื่อง</p><div className="formula"><span>Accuracy</span><b>+</b><span>Speed</span><b>+</b><span>Completion</span><b>+</b><span>Growth</span></div></article><article className="panel next-tier"><span>◇</span><div><small>NEXT TIER</small><h3>Diamond</h3><p>Accuracy เฉลี่ย 85%+ และรักษาความเร็วต่อเนื่องอีก 3 ชุด</p></div></article></section>
          </div>
        )}

        {view === "exam" && (
          <div className="exam-page">
            <header className="exam-header"><div><button className="back-link" onClick={() => { setRunning(false); setView("profile"); }}>← ออกจากแบบทดสอบ</button><h2>คณิตศาสตร์ • Math Challenge 05</h2></div><div className="exam-metrics"><div><small>ACTIVE TIME</small><b><span className={running ? "live-dot" : "live-dot paused-dot"} /> {formatTime(seconds)}</b></div><div><small>PROGRESS</small><b>{answeredCount}/{questions.length} ข้อ</b></div><button className="pause-btn" onClick={() => { setRunning(false); setResumeOpen(true); }}>Ⅱ พักการทำข้อสอบ</button></div></header>
            <div className="exam-body">
              <aside className="question-nav panel"><div className="nav-title"><div><p className="eyebrow">QUESTION MAP</p><h3>เลือกข้อสอบ</h3></div><span>{remaining} ข้อยังไม่ตอบ</span></div><div className="question-grid">{questions.map((_, i) => { const state = i === current ? "current" : answers[i] !== undefined ? "answered" : states[i] === "paused" ? "skipped" : "empty"; return <button key={i} className={state} onClick={() => goTo(i)} aria-label={`ไปข้อ ${i+1} สถานะ ${state}`}>{i+1}</button>; })}</div>
                <div className="question-legend"><span><i className="answered" />ตอบแล้ว</span><span><i className="skipped" />ข้ามไว้</span><span><i className="current" />ข้อปัจจุบัน</span></div>
                <form className="jump-form" onSubmit={(e) => { e.preventDefault(); const n = Number(jump); if (n >= 1 && n <= questions.length) { goTo(n-1); setJump(""); } }}><label htmlFor="jump">ไปยังข้อ</label><div><input id="jump" value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={`1-${questions.length}`} /><button type="submit">ไป</button></div></form>
                <button className="unanswered-btn" onClick={() => { const n = questions.findIndex((_, i) => answers[i] === undefined); if (n >= 0) goTo(n); }}>ไปข้อที่ยังไม่ได้ตอบ →</button>
              </aside>
              <section className="question-stage">
                <div className="question-status"><span>ข้อ {current+1} จาก {questions.length}</span><span className={`status-chip ${states[current] ?? "viewed"}`}>{answers[current] !== undefined ? states[current] === "changed_answer" ? "เปลี่ยนคำตอบแล้ว" : "ตอบแล้ว" : states[current] === "paused" ? "เคยข้ามไว้" : "กำลังดู"}</span><span className={`save-state ${saved ? "show" : ""}`}>✓ บันทึกอัตโนมัติแล้ว</span></div>
                <article className="question-card panel"><span className="question-number">{String(current+1).padStart(2,"0")}</span><p className="subject-tag">ALGEBRA • LEVEL 2</p><h1>{questions[current].q}</h1><p className="instruction">เลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียว</p><div className="choices">{questions[current].choices.map((choice, i) => <button key={choice} className={answers[current] === i ? "selected" : ""} onClick={() => choose(i)}><span>{String.fromCharCode(65+i)}</span><b>{choice}</b><i>{answers[current] === i ? "✓" : ""}</i></button>)}</div></article>
                <div className="exam-footer"><button disabled={current === 0} onClick={() => goTo(current-1)}>← ย้อนกลับ</button><button className="skip" onClick={() => { setStates((p) => ({ ...p, [current]: "paused" })); if (current < questions.length-1) goTo(current+1); }}>ข้ามข้อนี้</button>{current < questions.length-1 ? <button className="primary" onClick={() => goTo(current+1)}>ข้อถัดไป →</button> : <button className="submit" onClick={() => setSubmitOpen(true)}>ส่งข้อสอบ</button>}</div>
              </section>
            </div>
          </div>
        )}

        <nav className="mobile-nav"><button className={view === "profile" ? "active" : ""} onClick={() => setView("profile")}>◫<span>โปรไฟล์</span></button><button className={view === "ranking" ? "active" : ""} onClick={() => setView("ranking")}>♜<span>อันดับ</span></button><button className={view === "exam" ? "active" : ""} onClick={() => { setView("exam"); setRunning(true); }}>✦<span>แบบทดสอบ</span></button></nav>
      </section>

      {resumeOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="resume-title"><div className="modal panel"><div className="modal-gem">Ⅱ</div><p className="eyebrow">ATTEMPT PAUSED</p><h2 id="resume-title">พักการทำข้อสอบไว้</h2><p>คำตอบ ลำดับข้อ และ Active Time <b>{formatTime(seconds)}</b> ถูกบันทึกเรียบร้อยแล้ว</p><div className="resume-summary"><span><small>แบบทดสอบ</small><b>Math Challenge 05</b></span><span><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></span></div><button className="primary full" onClick={() => { setResumeOpen(false); setView("exam"); setRunning(true); }}>ทำข้อสอบต่อ →</button><button className="danger-link" onClick={cancelAttempt}>ยกเลิกข้อสอบนี้</button><small className="modal-note">เวลาระหว่างพักจะไม่ถูกนำมานับใน Active Time</small></div></div>}

      {submitOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-title"><div className="modal panel warning-modal"><div className="modal-gem warn">!</div><p className="eyebrow">SUBMIT CHECK</p><h2 id="submit-title">ยังตอบไม่ครบ {remaining} ข้อ</h2><p>กรุณาตอบทุกข้อก่อนส่งแบบทดสอบ ระบบจะไม่นับข้อที่เว้นว่างเป็นคำตอบ</p><div className="missing-list">{questions.map((_, i) => answers[i] === undefined && <button key={i} onClick={() => { setSubmitOpen(false); goTo(i); }}>ข้อ {i+1}</button>)}</div><button className="primary full" onClick={() => { setSubmitOpen(false); const n=questions.findIndex((_,i)=>answers[i]===undefined); if(n>=0)goTo(n); }}>ไปข้อที่ยังไม่ได้ตอบ →</button><button className="danger-link neutral" onClick={() => setSubmitOpen(false)}>กลับไปตรวจคำตอบ</button></div></div>}
    </main>
  );
}
