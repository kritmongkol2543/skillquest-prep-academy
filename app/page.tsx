"use client";

import { useEffect, useMemo, useState } from "react";

type View = "dashboard" | "ranking" | "exam";
type QuestionState = "viewed" | "paused" | "answered" | "changed_answer" | "reviewed";

const subjects = [
  { name: "ภาษาอังกฤษ", mastery: 88, delta: "+5", color: "blue" },
  { name: "ภาษาไทย", mastery: 82, delta: "+3", color: "green" },
  { name: "สังคมศึกษา", mastery: 79, delta: "+7", color: "orange" },
  { name: "คณิตศาสตร์", mastery: 74, delta: "+2", color: "purple" },
  { name: "วิทยาศาสตร์", mastery: 68, delta: "+4", color: "cyan" },
];

const questions = [
  { q: "ถ้า 3x + 7 = 22 แล้ว x มีค่าเท่าใด?", choices: ["3", "5", "7", "9"] },
  { q: "จำนวนใดเป็นจำนวนเฉพาะ?", choices: ["21", "27", "29", "33"] },
  { q: "พื้นที่ของสี่เหลี่ยมจัตุรัสด้านยาว 8 ซม. เท่ากับเท่าใด?", choices: ["16 ตร.ซม.", "32 ตร.ซม.", "64 ตร.ซม.", "80 ตร.ซม."] },
  { q: "3/4 เขียนเป็นทศนิยมได้ข้อใด?", choices: ["0.25", "0.50", "0.75", "1.25"] },
  { q: "ค่าเฉลี่ยของ 6, 8 และ 10 เท่ากับเท่าใด?", choices: ["7", "8", "9", "10"] },
  { q: "มุมตรงมีขนาดกี่องศา?", choices: ["45°", "90°", "180°", "360°"] },
  { q: "2⁵ มีค่าเท่าใด?", choices: ["10", "16", "25", "32"] },
  { q: "จำนวนถัดไปของ 2, 4, 8, 16 คือข้อใด?", choices: ["18", "24", "30", "32"] },
  { q: "รากที่สองของ 144 คือข้อใด?", choices: ["10", "11", "12", "14"] },
  { q: "15% ของ 200 เท่ากับเท่าใด?", choices: ["15", "20", "30", "45"] },
];

const history = [
  { date: "10 ก.ค.", subject: "คณิตศาสตร์", set: "Math Challenge 04", score: "42/50", accuracy: "84%", time: "28:16", status: "สำเร็จ" },
  { date: "8 ก.ค.", subject: "ภาษาอังกฤษ", set: "English Sprint 08", score: "46/50", accuracy: "92%", time: "21:44", status: "สำเร็จ" },
  { date: "5 ก.ค.", subject: "วิทยาศาสตร์", set: "Science Core 03", score: "—", accuracy: "—", time: "08:32", status: "ยกเลิก" },
];

const leaders = [
  { name: "ภูผา", points: "14,920", gain: "+18%", initials: "ภ" },
  { name: "นีน่า", points: "13,870", gain: "+14%", initials: "น" },
  { name: "Boss", points: "12,450", gain: "+12%", initials: "B", me: true },
  { name: "มายด์", points: "11,930", gain: "+11%", initials: "ม" },
  { name: "ต้น", points: "10,840", gain: "+9%", initials: "ต" },
];

function formatTime(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [name, setName] = useState("Boss");
  const [editingName, setEditingName] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({ 0: 1, 1: 2, 3: 2 });
  const [states, setStates] = useState<Record<number, QuestionState>>({ 0: "answered", 1: "answered", 2: "paused", 3: "answered", 4: "viewed" });
  const [seconds, setSeconds] = useState(847);
  const [running, setRunning] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [range, setRange] = useState("30 วัน");
  const [saved, setSaved] = useState(false);

  const answeredCount = Object.keys(answers).length;
  const remaining = questions.length - answeredCount;
  const initials = name.trim().slice(0, 1).toUpperCase() || "ผ";

  useEffect(() => {
    const savedName = localStorage.getItem("skillquest-name");
    if (savedName) setName(savedName);
    const raw = localStorage.getItem("skillquest-attempt");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      setAnswers(data.answers ?? {}); setStates(data.states ?? {});
      setCurrent(data.current ?? 0); setSeconds(data.seconds ?? 0);
      setResumeOpen(data.status === "paused");
    } catch { /* Keep the safe defaults. */ }
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    localStorage.setItem("skillquest-attempt", JSON.stringify({ answers, states, current, seconds, status: running ? "in_progress" : "paused" }));
    setSaved(true);
    const timer = window.setTimeout(() => setSaved(false), 900);
    return () => window.clearTimeout(timer);
  }, [answers, states, current, seconds, running]);

  const chartPoints = useMemo(() => range === "30 วัน" ? "0,86 48,67 96,72 144,38 192,52 240,24 288,35 336,12" : "0,78 48,72 96,50 144,63 192,34 240,44 288,18 336,26", [range]);

  function openExam() { setView("exam"); setRunning(true); }
  function goTo(index: number) {
    setStates((prev) => ({ ...prev, [current]: answers[current] !== undefined ? "reviewed" : "paused", [index]: answers[index] !== undefined ? "reviewed" : "viewed" }));
    setCurrent(index);
  }
  function choose(choice: number) {
    const changed = answers[current] !== undefined && answers[current] !== choice;
    setAnswers((prev) => ({ ...prev, [current]: choice }));
    setStates((prev) => ({ ...prev, [current]: changed ? "changed_answer" : "answered" }));
  }
  function saveName() {
    const clean = name.trim() || "ผู้เตรียมสอบ";
    setName(clean); localStorage.setItem("skillquest-name", clean); setEditingName(false);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("dashboard")} aria-label="ไปหน้าภาพรวม">
          <span className="brand-mark">SQ</span><span><b>SkillQuest</b><small>PREP ACADEMY</small></span>
        </button>
        <nav aria-label="เมนูหลัก">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><Glyph>⌂</Glyph>ภาพรวม</button>
          <button onClick={() => setView("dashboard")}><Glyph>◷</Glyph>ประวัติการฝึก</button>
          <button className={view === "ranking" ? "active" : ""} onClick={() => setView("ranking")}><Glyph>≋</Glyph>อันดับ</button>
          <button className={view === "exam" ? "active" : ""} onClick={openExam}><Glyph>✓</Glyph>คลังข้อสอบ</button>
        </nav>
        <div className="side-note"><span>เป้าหมายสัปดาห์นี้</span><b>4 จาก 5 ชุด</b><div className="progress"><i style={{ width: "80%" }} /></div><small>เหลืออีก 1 ชุด</small></div>
        <div className="user-chip"><span className="avatar">{initials}</span><div><b>{name}</b><small>ผู้เตรียมสอบ</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setView("dashboard")}><span className="brand-mark">SQ</span><b>SkillQuest</b></button>
          <span className="today">วันเสาร์ที่ 11 กรกฎาคม</span>
          <div className="top-summary"><span><b>12</b> วันต่อเนื่อง</span><span><b>12,450</b> คะแนน</span><span className="avatar small">{initials}</span></div>
        </header>

        {view === "dashboard" && <div className="page dashboard-page">
          <div className="welcome">
            <div><p>ภาพรวมการฝึก</p><h1>สวัสดี, {name}</h1><span>คุณกำลังพัฒนาได้ดี โดยเฉพาะความแม่นยำในภาษาอังกฤษ</span></div>
            <button className="primary" onClick={openExam}>เริ่มทำข้อสอบ <span>→</span></button>
          </div>

          <section className="focus-band">
            <div className="focus-copy"><span className="focus-icon">↗</span><div><small>คำแนะนำสำหรับวันนี้</small><h2>ฝึกคณิตศาสตร์อีก 1 ชุด</h2><p>คะแนนเรื่องสมการดีขึ้น 8% แต่ยังใช้เวลามากกว่าค่าเฉลี่ย ลองชุดฝึกแบบจับเวลา 25 นาที</p></div></div>
            <button onClick={openExam}>เริ่มชุดแนะนำ</button>
          </section>

          <section className="metric-row" aria-label="สถิติสำคัญ">
            <article><span>คะแนนเฉลี่ย</span><b>82%</b><small className="positive">↑ 6% จากเดือนก่อน</small></article>
            <article><span>เวลาฝึกทั้งหมด</span><b>18.4 ชม.</b><small>เดือนนี้ 6 ชม. 20 นาที</small></article>
            <article><span>ทำข้อสอบแล้ว</span><b>24 ชุด</b><small>สำเร็จ 22 · ยกเลิก 2</small></article>
            <article><span>อันดับปัจจุบัน</span><b>#3</b><small className="positive">Top 12% ของกลุ่ม</small></article>
          </section>

          <section className="dashboard-grid">
            <article className="panel trend-card">
              <div className="section-heading"><div><h2>พัฒนาการคะแนน</h2><p>ค่าเฉลี่ยจากข้อสอบที่ส่งสำเร็จ</p></div><select value={range} onChange={(e) => setRange(e.target.value)} aria-label="เลือกช่วงเวลา"><option>30 วัน</option><option>90 วัน</option></select></div>
              <div className="trend-plot"><div className="axis"><span>100</span><span>75</span><span>50</span><span>25</span></div><svg viewBox="0 0 336 100" preserveAspectRatio="none" role="img" aria-label="กราฟคะแนนมีแนวโน้มสูงขึ้น"><polyline points={chartPoints} /></svg><div className="dates"><span>12 มิ.ย.</span><span>20 มิ.ย.</span><span>28 มิ.ย.</span><span>6 ก.ค.</span><span>วันนี้</span></div></div>
            </article>
            <article className="panel next-card"><div className="section-heading"><div><h2>เป้าหมายถัดไป</h2><p>เส้นทางสู่ระดับ Diamond</p></div><span className="level-badge">Platinum III</span></div><div className="ring"><b>72%</b><span>550 คะแนน</span></div><p>รักษาความแม่นยำเฉลี่ย 85% และทำข้อสอบครบอีก 3 ชุด</p><div className="next-checks"><span className="done">✓ ฝึกต่อเนื่อง 7 วัน</span><span>○ ความแม่นยำ 85% ขึ้นไป</span><span>○ ทำครบอีก 3 ชุด</span></div></article>
          </section>

          <section className="panel mastery-card">
            <div className="section-heading"><div><h2>ความชำนาญรายวิชา</h2><p>เทียบกับผลการฝึก 30 วันที่ผ่านมา</p></div><button className="text-button">ดูรายละเอียด</button></div>
            <div className="subject-list">{subjects.map((s) => <div className="subject-row" key={s.name}><div><b>{s.name}</b><small className="positive">{s.delta}%</small></div><div className="progress"><i className={s.color} style={{ width: `${s.mastery}%` }} /></div><strong>{s.mastery}%</strong></div>)}</div>
          </section>

          <section className="panel history-card"><div className="section-heading"><div><h2>ประวัติล่าสุด</h2><p>ผู้ปกครองสามารถดูความสม่ำเสมอและผลการฝึกได้จากที่นี่</p></div><button className="text-button">ดูทั้งหมด</button></div><div className="history-table"><div className="history-head"><span>วันที่</span><span>ชุดข้อสอบ</span><span>คะแนน</span><span>ความแม่นยำ</span><span>เวลาที่ใช้</span><span>สถานะ</span></div>{history.map((h) => <div className="history-row" key={h.set}><span>{h.date}</span><span><b>{h.subject}</b><small>{h.set}</small></span><span>{h.score}</span><span>{h.accuracy}</span><span>{h.time}</span><span className={h.status === "สำเร็จ" ? "status success" : "status cancelled"}>{h.status}</span></div>)}</div></section>

          <section className="profile-settings"><div><span className="avatar large">{initials}</span><div><h2>ชื่อที่ใช้แสดงคะแนน</h2><p>ชื่อนี้จะแสดงในอันดับและรายงานผล ไม่มีการสร้างบัญชีผู้ใช้</p></div></div>{editingName ? <form onSubmit={(e) => { e.preventDefault(); saveName(); }}><input autoFocus value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-label="ชื่อที่ใช้แสดง"/><button className="primary" type="submit">บันทึก</button></form> : <button className="secondary" onClick={() => setEditingName(true)}>เปลี่ยนชื่อ</button>}</section>
        </div>}

        {view === "ranking" && <div className="page ranking-page">
          <div className="welcome"><div><p>อันดับประจำสัปดาห์</p><h1>ความสม่ำเสมอพาไปข้างหน้า</h1><span>คะแนนอันดับคิดจากความแม่นยำ ความเร็ว และพัฒนาการ ไม่ใช่คะแนนดิบอย่างเดียว</span></div><div className="season"><small>สิ้นสุดฤดูกาลใน</small><b>12 วัน 08:42:19</b></div></div>
          <section className="rank-summary"><div><span>อันดับของคุณ</span><b>#3</b><small>Top 12% ของกลุ่ม</small></div><div><span>ระดับปัจจุบัน</span><b>Platinum III</b><small>อีก 550 คะแนนถึง Diamond</small></div><div><span>พัฒนาการสัปดาห์นี้</span><b className="positive">+12%</b><small>อันดับดีขึ้น 2 ตำแหน่ง</small></div></section>
          <section className="panel leaderboard"><div className="section-heading"><div><h2>ผู้ฝึกที่โดดเด่น</h2><p>อัปเดตจากผลการฝึกล่าสุด</p></div><span className="updated">อัปเดต 5 นาทีที่แล้ว</span></div><div className="leader-list">{leaders.map((l, i) => <div className={`leader-row ${l.me ? "me" : ""}`} key={l.name}><span className={`position p${i + 1}`}>{i + 1}</span><span className="avatar">{l.me ? initials : l.initials}</span><span className="leader-name"><b>{l.me ? name : l.name}{l.me && " (คุณ)"}</b><small>{i < 2 ? "Diamond" : i < 4 ? "Platinum" : "Gold"}</small></span><span className="gain">{l.gain}</span><span className="leader-points"><b>{l.points}</b><small>คะแนนอันดับ</small></span></div>)}</div></section>
          <section className="ranking-note"><h2>ระบบคิดคะแนนอย่างไร</h2><p>ระบบให้ความสำคัญกับการฝึกที่มีคุณภาพ คะแนนมาจากความแม่นยำ 40% ความเร็ว 25% การทำครบ 20% และพัฒนาการ 15% เพื่อให้ทุกคนมีโอกาสขยับอันดับได้จากการพัฒนาตัวเอง</p></section>
        </div>}

        {view === "exam" && <div className="exam-page">
          <header className="exam-header"><div><button className="back-link" onClick={() => { setRunning(false); setView("dashboard"); }}>← กลับภาพรวม</button><h1>คณิตศาสตร์ · ชุดฝึกจับเวลา 05</h1></div><div className="exam-metrics"><div><small>เวลาที่ทำจริง</small><b><i className={running ? "live-dot" : "live-dot paused"}/>{formatTime(seconds)}</b></div><div><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></div><button className="secondary" onClick={() => { setRunning(false); setResumeOpen(true); }}>พักข้อสอบ</button></div></header>
          <div className="exam-body"><aside className="question-nav"><div><h2>รายการข้อ</h2><span>{remaining} ข้อยังไม่ตอบ</span></div><div className="question-grid">{questions.map((_, i) => { const state = i === current ? "current" : answers[i] !== undefined ? "answered" : states[i] === "paused" ? "skipped" : "empty"; return <button key={i} className={state} onClick={() => goTo(i)} aria-label={`ไปข้อ ${i + 1}`}>{i + 1}</button>; })}</div><div className="question-legend"><span><i className="answered"/>ตอบแล้ว</span><span><i className="skipped"/>ข้ามไว้</span><span><i className="current"/>ข้อปัจจุบัน</span></div></aside>
            <section className="question-stage"><div className="question-status"><span>ข้อ {current + 1} จาก {questions.length}</span><span>{answers[current] !== undefined ? "ตอบแล้ว" : states[current] === "paused" ? "ข้ามไว้" : "กำลังทำ"}</span><span className={`save-state ${saved ? "show" : ""}`}>✓ บันทึกแล้ว</span></div><article className="question-card"><small>พีชคณิต · ระดับพื้นฐาน</small><h2>{questions[current].q}</h2><p>เลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียว</p><div className="choices">{questions[current].choices.map((choice, i) => <button key={choice} className={answers[current] === i ? "selected" : ""} onClick={() => choose(i)}><span>{String.fromCharCode(65 + i)}</span><b>{choice}</b><i>{answers[current] === i ? "✓" : ""}</i></button>)}</div></article><div className="exam-footer"><button className="secondary" disabled={current === 0} onClick={() => goTo(current - 1)}>ย้อนกลับ</button><button className="skip" onClick={() => { setStates((p) => ({ ...p, [current]: "paused" })); if (current < questions.length - 1) goTo(current + 1); }}>ข้ามข้อนี้</button>{current < questions.length - 1 ? <button className="primary" onClick={() => goTo(current + 1)}>ข้อถัดไป →</button> : <button className="primary" onClick={() => setSubmitOpen(true)}>ส่งข้อสอบ</button>}</div></section>
          </div>
        </div>}

        <nav className="mobile-nav" aria-label="เมนูบนมือถือ"><button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><Glyph>⌂</Glyph><span>ภาพรวม</span></button><button className={view === "ranking" ? "active" : ""} onClick={() => setView("ranking")}><Glyph>≋</Glyph><span>อันดับ</span></button><button className={view === "exam" ? "active" : ""} onClick={openExam}><Glyph>✓</Glyph><span>ข้อสอบ</span></button></nav>
      </section>

      {resumeOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="resume-title"><div className="modal"><span className="modal-icon">Ⅱ</span><h2 id="resume-title">พักการทำข้อสอบแล้ว</h2><p>คำตอบและเวลาที่ทำจริง <b>{formatTime(seconds)}</b> ถูกบันทึกไว้ เวลาระหว่างพักจะไม่ถูกนำมานับ</p><div className="resume-summary"><span><small>ชุดข้อสอบ</small><b>คณิตศาสตร์ 05</b></span><span><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></span></div><button className="primary full" onClick={() => { setResumeOpen(false); setView("exam"); setRunning(true); }}>ทำข้อสอบต่อ</button><button className="danger-link" onClick={() => { localStorage.removeItem("skillquest-attempt"); setResumeOpen(false); setView("dashboard"); }}>ยกเลิกชุดนี้</button></div></div>}
      {submitOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-title"><div className="modal"><span className="modal-icon warning">!</span><h2 id="submit-title">ยังเหลือ {remaining} ข้อ</h2><p>ตรวจคำตอบให้ครบก่อนส่ง เพื่อให้ระบบวิเคราะห์ผลได้แม่นยำ</p><div className="missing-list">{questions.map((_, i) => answers[i] === undefined && <button key={i} onClick={() => { setSubmitOpen(false); goTo(i); }}>ข้อ {i + 1}</button>)}</div><button className="primary full" onClick={() => { setSubmitOpen(false); const n = questions.findIndex((_, i) => answers[i] === undefined); if (n >= 0) goTo(n); }}>ไปข้อที่ยังไม่ตอบ</button><button className="danger-link neutral" onClick={() => setSubmitOpen(false)}>กลับไปตรวจคำตอบ</button></div></div>}
    </main>
  );
}
