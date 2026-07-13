"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensureAnonymousSession,
  loadDashboardSummary,
  loadRemoteTest,
  logQuestionActivity,
  loadLeaderboard,
  loadRemoteAttempts,
  loadRemoteTests,
  requestRemoteHint,
  saveRemoteProfile,
  submitRemoteAttempt,
  type AttemptResult,
  type DashboardSummary,
  type HintResult,
  type LeaderboardEntry,
  type QuestionLogEvent,
  type QuestionLogStatus,
  type RemoteAttempt,
  type RemoteTest,
  type RemoteTestPayload,
} from "@/lib/supabase";

type View = "dashboard" | "ranking" | "exam";
type QuestionState = "viewed" | "paused" | "answered" | "changed_answer" | "reviewed";
type ExamQuestion = {
  id: string;
  q: string;
  choices: string[];
  subject: string;
  category: string;
  level: string;
  image: string | null;
};

const subjects = [
  { name: "ภาษาอังกฤษ", mastery: 88, delta: "+5", color: "blue" },
  { name: "ภาษาไทย", mastery: 82, delta: "+3", color: "green" },
  { name: "สังคมศึกษา", mastery: 79, delta: "+7", color: "orange" },
  { name: "คณิตศาสตร์", mastery: 74, delta: "+2", color: "purple" },
  { name: "วิทยาศาสตร์", mastery: 68, delta: "+4", color: "cyan" },
];

const FALLBACK_TEST_ID = "10000000-0000-4000-8000-000000000001";
const fallbackTest: RemoteTest = {
  test_id: FALLBACK_TEST_ID,
  category_id: "",
  title: "คณิตศาสตร์ · ชุดตัวอย่าง",
  subject: "คณิตศาสตร์",
  subject_id: "",
  category: "ชุดตัวอย่าง",
  level: "ระดับพื้นฐาน",
  duration: 1800,
  question_count: 10,
};
const fallbackQuestions: ExamQuestion[] = [
  { id: "20000000-0000-4000-8000-000000000001", q: "ถ้า 3x + 7 = 22 แล้ว x มีค่าเท่าใด?", choices: ["3", "5", "7", "9"], subject: "คณิตศาสตร์", category: "พีชคณิต", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000002", q: "จำนวนใดเป็นจำนวนเฉพาะ?", choices: ["21", "27", "29", "33"], subject: "คณิตศาสตร์", category: "จำนวน", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000003", q: "พื้นที่ของสี่เหลี่ยมจัตุรัสด้านยาว 8 ซม. เท่ากับเท่าใด?", choices: ["16 ตร.ซม.", "32 ตร.ซม.", "64 ตร.ซม.", "80 ตร.ซม."], subject: "คณิตศาสตร์", category: "เรขาคณิต", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000004", q: "3/4 เขียนเป็นทศนิยมได้ข้อใด?", choices: ["0.25", "0.50", "0.75", "1.25"], subject: "คณิตศาสตร์", category: "เศษส่วน", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000005", q: "ค่าเฉลี่ยของ 6, 8 และ 10 เท่ากับเท่าใด?", choices: ["7", "8", "9", "10"], subject: "คณิตศาสตร์", category: "สถิติ", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000006", q: "มุมตรงมีขนาดกี่องศา?", choices: ["45°", "90°", "180°", "360°"], subject: "คณิตศาสตร์", category: "เรขาคณิต", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000007", q: "2⁵ มีค่าเท่าใด?", choices: ["10", "16", "25", "32"], subject: "คณิตศาสตร์", category: "เลขยกกำลัง", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000008", q: "จำนวนถัดไปของ 2, 4, 8, 16 คือข้อใด?", choices: ["18", "24", "30", "32"], subject: "คณิตศาสตร์", category: "ลำดับ", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000009", q: "รากที่สองของ 144 คือข้อใด?", choices: ["10", "11", "12", "14"], subject: "คณิตศาสตร์", category: "รากที่สอง", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000010", q: "15% ของ 200 เท่ากับเท่าใด?", choices: ["15", "20", "30", "45"], subject: "คณิตศาสตร์", category: "ร้อยละ", level: "ระดับพื้นฐาน", image: null },
];

const defaultAnswers: Record<number, number> = {};
const defaultStates: Record<number, QuestionState> = {};

type SavedAttempt = {
  answers?: Record<number, number>;
  states?: Record<number, QuestionState>;
  current?: number;
  seconds?: number;
  questionSeconds?: Record<number, number>;
  hints?: Record<number, HintResult[]>;
  status?: "in_progress" | "paused";
  testId?: string;
};

let cachedSavedAttempt: SavedAttempt | null | undefined;

function readSavedAttempt() {
  if (cachedSavedAttempt !== undefined) return cachedSavedAttempt;
  if (typeof window === "undefined") {
    cachedSavedAttempt = null;
    return cachedSavedAttempt;
  }
  try {
    const raw = localStorage.getItem("skillquest-attempt");
    cachedSavedAttempt = raw ? JSON.parse(raw) as SavedAttempt : null;
  } catch {
    cachedSavedAttempt = null;
  }
  return cachedSavedAttempt;
}

function readInitialName() {
  if (typeof window === "undefined") return "Boss";
  return localStorage.getItem("skillquest-name") ?? "Boss";
}

function readInitialNonce() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("skillquest-attempt-nonce") ?? crypto.randomUUID();
}

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
  const [name, setName] = useState(readInitialName);
  const [editingName, setEditingName] = useState(false);
  const [current, setCurrent] = useState(() => readSavedAttempt()?.current ?? 0);
  const [answers, setAnswers] = useState<Record<number, number>>(() => readSavedAttempt()?.answers ?? defaultAnswers);
  const [states, setStates] = useState<Record<number, QuestionState>>(() => readSavedAttempt()?.states ?? defaultStates);
  const [seconds, setSeconds] = useState(() => readSavedAttempt()?.seconds ?? 0);
  const [running, setRunning] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(() => readSavedAttempt()?.status === "paused");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [range, setRange] = useState("30 วัน");
  const [saved, setSaved] = useState(false);
  const [clientNonce, setClientNonce] = useState(readInitialNonce);
  const [backendStatus, setBackendStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [backendMessage, setBackendMessage] = useState("");
  const [remoteAttempts, setRemoteAttempts] = useState<RemoteAttempt[]>([]);
  const [remoteLeaders, setRemoteLeaders] = useState<LeaderboardEntry[]>([]);
  const [testOptions, setTestOptions] = useState<RemoteTest[]>([]);
  const [selectedTest, setSelectedTest] = useState<RemoteTest>(fallbackTest);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loadedTestId, setLoadedTestId] = useState("");
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [questionSeconds, setQuestionSeconds] = useState<Record<number, number>>(() => readSavedAttempt()?.questionSeconds ?? {});
  const [hints, setHints] = useState<Record<number, HintResult[]>>(() => readSavedAttempt()?.hints ?? {});
  const [hinting, setHinting] = useState(false);
  const currentRef = useRef(current);
  const answersRef = useRef(answers);
  const statesRef = useRef(states);
  const questionSecondsRef = useRef(questionSeconds);
  const questionsRef = useRef(questions);
  const selectedTestRef = useRef(selectedTest);
  const initialNameRef = useRef(name);

  const answeredCount = Object.keys(answers).filter((key) => Number(key) < questions.length).length;
  const remaining = questions.length - answeredCount;
  const initials = name.trim().slice(0, 1).toUpperCase() || "ผ";
  const currentQuestionSeconds = questionSeconds[current] ?? 0;
  const totalHintsUsed = Object.values(hints).reduce((sum, item) => sum + item.length, 0);
  const hintPenalty = totalHintsUsed * 0.5;
  const currentHints = hints[current] ?? [];
  const eliminatedChoices = new Set(currentHints.flatMap((hint) => hint.eliminated_choices ?? []));
  const currentQuestion = questions[current] ?? questions[0] ?? fallbackQuestions[0];
  const activeTestId = selectedTest.test_id;
  const activeTestTitle = selectedTest.title;
  const examReady = Boolean(activeTestId) && !loadingQuestions;
  const activeSubject = selectedTest.subject;
  const subjectOptions = Array.from(new Set((testOptions.length ? testOptions : [fallbackTest]).map((test) => test.subject)));
  const categoryOptions = (testOptions.length ? testOptions : [fallbackTest]).filter((test) => test.subject === activeSubject);

  function normalizeRemoteTest(payload: RemoteTestPayload): ExamQuestion[] {
    return payload.questions.map((question) => ({
      id: question.id,
      q: question.question,
      choices: question.choices
        .slice()
        .sort((a, b) => a.choice_index - b.choice_index)
        .map((choice) => choice.answer),
      subject: payload.test.subject,
      category: payload.test.category,
      level: question.level || payload.test.level,
      image: question.image,
    }));
  }

  async function loadExamTest(testId: string, reset = false) {
    setLoadingQuestions(true);
    try {
      const payload = await loadRemoteTest(testId);
      const normalized = normalizeRemoteTest(payload);
      setSelectedTest(payload.test);
      setQuestions(normalized);
      setLoadedTestId(payload.test.test_id);
      selectedTestRef.current = payload.test;
      questionsRef.current = normalized;
      setCurrent(0);
      if (reset) resetAttemptState();
      setBackendMessage("");
      return true;
    } catch {
      setBackendMessage("โหลดชุดข้อสอบจากฐานข้อมูลไม่สำเร็จ กำลังใช้ชุดตัวอย่างในเครื่อง");
      setSelectedTest(fallbackTest);
      setQuestions(fallbackQuestions);
      setLoadedTestId(fallbackTest.test_id);
      selectedTestRef.current = fallbackTest;
      questionsRef.current = fallbackQuestions;
      return false;
    } finally {
      setLoadingQuestions(false);
    }
  }

  function chooseTestOption(testId: string) {
    const nextTest = (testOptions.length ? testOptions : [fallbackTest]).find((test) => test.test_id === testId);
    if (!nextTest) return;
    setSelectedTest(nextTest);
    setQuestions([]);
    setLoadedTestId("");
    selectedTestRef.current = nextTest;
    questionsRef.current = [];
    resetAttemptState();
    setBackendMessage("");
  }

  function chooseSubjectOption(subject: string) {
    const nextTest = (testOptions.length ? testOptions : [fallbackTest]).find((test) => test.subject === subject);
    if (nextTest) chooseTestOption(nextTest.test_id);
  }

  useEffect(() => {
    void (async () => {
      try {
        await ensureAnonymousSession(initialNameRef.current);
        const [attemptRows, leaderRows, testRows, summary] = await Promise.all([loadRemoteAttempts(), loadLeaderboard(), loadRemoteTests(), loadDashboardSummary()]);
        setRemoteAttempts(attemptRows); setRemoteLeaders(leaderRows);
        setDashboardSummary(summary);
        setTestOptions(testRows);
        const savedTestId = readSavedAttempt()?.testId;
        const nextTest = testRows.find((test) => test.test_id === savedTestId) ?? testRows[0];
        if (nextTest) {
          setSelectedTest(nextTest);
          setQuestions([]);
          setLoadedTestId("");
        }
        setBackendStatus("online");
      } catch (error) {
        setBackendStatus("offline");
        setQuestions(fallbackQuestions);
        setLoadedTestId(fallbackTest.test_id);
        setBackendMessage(error instanceof Error && error.message.includes("Anonymous sign-ins are disabled")
          ? "ระบบฐานข้อมูลรอเปิด Anonymous Sign-In"
          : "ใช้งานแบบออฟไลน์ ข้อมูลในเครื่องยังปลอดภัย");
      }
    })();
  }, []);

  useEffect(() => {
    currentRef.current = current;
    answersRef.current = answers;
    statesRef.current = states;
    questionSecondsRef.current = questionSeconds;
    questionsRef.current = questions;
    selectedTestRef.current = selectedTest;
  }, [answers, current, questionSeconds, questions, selectedTest, states]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((s) => s + 1);
      setQuestionSeconds((items) => ({ ...items, [current]: (items[current] ?? 0) + 1 }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [current, running]);

  useEffect(() => {
    if (!running || backendStatus !== "online" || !clientNonce) return;
    const heartbeat = window.setInterval(() => {
      void syncQuestionLog(currentRef.current, "heartbeat");
    }, 8000);
    return () => window.clearInterval(heartbeat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendStatus, clientNonce, running]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") void syncQuestionLog(currentRef.current, "pause", "paused");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (clientNonce) localStorage.setItem("skillquest-attempt-nonce", clientNonce);
    localStorage.setItem("skillquest-attempt", JSON.stringify({ answers, states, current, seconds, questionSeconds, hints, testId: activeTestId, status: running ? "in_progress" : "paused" }));
    const showTimer = window.setTimeout(() => setSaved(true), 0);
    const hideTimer = window.setTimeout(() => setSaved(false), 900);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [activeTestId, answers, states, current, seconds, questionSeconds, hints, running, clientNonce]);

  const chartPoints = useMemo(() => range === "30 วัน" ? "0,86 48,67 96,72 144,38 192,52 240,24 288,35 336,12" : "0,78 48,72 96,50 144,63 192,34 240,44 288,18 336,26", [range]);
  const averageAccuracy = dashboardSummary ? Math.round(Number(dashboardSummary.average_accuracy)) : remoteAttempts.length ? Math.round(remoteAttempts.reduce((sum, item) => sum + Number(item.accuracy), 0) / remoteAttempts.length) : 82;
  const totalSeconds = dashboardSummary ? Number(dashboardSummary.active_seconds ?? 0) : remoteAttempts.reduce((sum, item) => sum + item.elapsed_seconds, 0);
  const syncedAttemptsCount = dashboardSummary ? Number(dashboardSummary.attempts_count ?? 0) : remoteAttempts.length;
  const subjectMastery = dashboardSummary?.subjects?.length
    ? dashboardSummary.subjects.map((item, index) => ({
      name: item.subject,
      mastery: Math.max(0, Math.min(100, Math.round(Number(item.accuracy) || 0))),
      delta: `${Number(item.attempts) || 0} ชุด`,
      color: ["blue", "purple", "cyan", "green", "orange"][index % 5],
    }))
    : subjects;
  const remoteHistory = remoteAttempts.map((item) => ({
    date: new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(item.submitted_at)),
    subject: item.Test?.Subject ?? "แบบทดสอบ",
    set: item.Test?.Question ?? "ชุดฝึก",
    score: `${item.correct_count}/${item.total_questions}`,
    accuracy: `${Math.round(Number(item.accuracy))}%`,
    time: formatTime(item.elapsed_seconds).slice(3),
    status: "สำเร็จ",
  }));

  function statusFor(index: number): QuestionLogStatus {
    if (answersRef.current[index] !== undefined) return statesRef.current[index] === "changed_answer" ? "changed_answer" : "answered";
    if (statesRef.current[index] === "paused") return "skipped";
    return "viewed";
  }

  async function syncQuestionLog(index: number, eventType: QuestionLogEvent, status?: QuestionLogStatus, quiet = true) {
    const activeQuestions = questionsRef.current;
    const activeTest = selectedTestRef.current;
    if (backendStatus !== "online" || !clientNonce || !activeQuestions[index] || !activeTest.test_id) return;
    try {
      await logQuestionActivity({
        set_id: activeTest.test_id,
        question_id: activeQuestions[index].id,
        client_nonce: clientNonce,
        event_type: eventType,
        duration_seconds: questionSecondsRef.current[index] ?? 0,
        selected_choice: answersRef.current[index] ?? null,
        status: status ?? statusFor(index),
      });
    } catch {
      if (!quiet) setBackendMessage("บันทึก Log รายข้อยังไม่สำเร็จ ระบบจะลองใหม่เมื่อมีการทำรายการถัดไป");
    }
  }

  async function syncAllQuestionLogs(eventType: QuestionLogEvent) {
    if (backendStatus !== "online" || !clientNonce) return;
    await Promise.all(questions.map((_, index) => syncQuestionLog(index, eventType, index === currentRef.current ? "submitted" : statusFor(index))));
  }

  async function openExam() {
    if (!examReady) {
      setBackendMessage("กำลังโหลดชุดข้อสอบ กรุณารอสักครู่");
      return;
    }
    if (loadedTestId !== activeTestId || questions.length === 0) {
      const ok = await loadExamTest(activeTestId);
      if (!ok && backendStatus === "online") return;
    }
    setView("exam");
    setRunning(true);
    void syncQuestionLog(current, "enter", statusFor(current));
  }
  function goTo(index: number) {
    void syncQuestionLog(current, answers[current] !== undefined ? "answer" : "skip");
    setStates((prev) => ({ ...prev, [current]: answers[current] !== undefined ? "reviewed" : "paused", [index]: answers[index] !== undefined ? "reviewed" : "viewed" }));
    setCurrent(index);
    window.setTimeout(() => void syncQuestionLog(index, "enter", statusFor(index)), 0);
  }
  function choose(choice: number) {
    const changed = answers[current] !== undefined && answers[current] !== choice;
    setAnswers((prev) => ({ ...prev, [current]: choice }));
    setStates((prev) => ({ ...prev, [current]: changed ? "changed_answer" : "answered" }));
    window.setTimeout(() => void syncQuestionLog(current, "answer", changed ? "changed_answer" : "answered"), 0);
  }
  function resetAttemptState(clearResult = true) {
    const nextNonce = crypto.randomUUID();
    localStorage.removeItem("skillquest-attempt");
    localStorage.setItem("skillquest-attempt-nonce", nextNonce);
    setClientNonce(nextNonce);
    setAnswers({});
    setStates({});
    setCurrent(0);
    setSeconds(0);
    setQuestionSeconds({});
    setHints({});
    if (clearResult) setResult(null);
  }
  async function saveName() {
    const clean = name.trim() || "ผู้เตรียมสอบ";
    setName(clean); localStorage.setItem("skillquest-name", clean); setEditingName(false);
    if (backendStatus === "online") {
      try { await saveRemoteProfile(clean); setRemoteLeaders(await loadLeaderboard()); }
      catch { setBackendMessage("บันทึกชื่อในเครื่องแล้ว และจะซิงก์ใหม่ภายหลัง"); }
    }
  }
  async function handleHint() {
    if (backendStatus !== "online" || !clientNonce) {
      setBackendMessage("Hint ต้องเชื่อมต่อฐานข้อมูลก่อน เพื่อจำกัดสิทธิ์ 2 ครั้งต่อชุดข้อสอบ");
      return;
    }
    if (totalHintsUsed >= 2) {
      setBackendMessage("ใช้ Hint ครบ 2 ครั้งสำหรับชุดนี้แล้ว");
      return;
    }
    if (currentHints.length > 0) {
      setBackendMessage("ข้อนี้ใช้ Hint ไปแล้ว ระบบตัดตัวเลือกผิดให้แล้ว");
      return;
    }
    setHinting(true);
    try {
      await syncQuestionLog(current, "hint", statusFor(current));
      const hint = await requestRemoteHint({
        set_id: activeTestId,
        question_id: questions[current].id,
        client_nonce: clientNonce,
        duration_seconds: questionSecondsRef.current[current] ?? 0,
      });
      setHints((prev) => ({ ...prev, [current]: [...(prev[current] ?? []), hint] }));
      setBackendMessage("");
    } catch (error) {
      setBackendMessage(error instanceof Error && error.message === "HINT_LIMIT_REACHED"
        ? "ใช้ Hint ครบ 2 ครั้งสำหรับชุดนี้แล้ว"
        : "ขอ Hint ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setHinting(false);
    }
  }
  async function handleSubmit() {
    if (remaining > 0) { setSubmitOpen(true); return; }
    if (backendStatus !== "online" || !clientNonce) {
      setBackendMessage("ยังส่งผลไม่ได้ในขณะออฟไลน์ คำตอบถูกเก็บไว้ในเครื่องแล้ว");
      return;
    }
    setSubmitting(true); setRunning(false);
    try {
      await syncAllQuestionLogs("submit");
      const keyedAnswers = Object.fromEntries(Object.entries(answers).map(([index, choice]) => [questions[Number(index)].id, choice]));
      const submitted = await submitRemoteAttempt({ set_id: activeTestId, answers: keyedAnswers, elapsed_seconds: Math.max(30, seconds), client_nonce: clientNonce });
      setResult(submitted);
      const [attemptRows, leaderRows] = await Promise.all([loadRemoteAttempts(), loadLeaderboard()]);
      setRemoteAttempts(attemptRows); setRemoteLeaders(leaderRows);
      resetAttemptState(false);
    } catch (error) {
      setRunning(true);
      setBackendMessage(error instanceof Error && error.message === "RATE_LIMITED" ? "ส่งข้อสอบถี่เกินไป กรุณารอสักครู่" : "ส่งผลไม่สำเร็จ คำตอบยังอยู่ในเครื่องและลองใหม่ได้");
    } finally { setSubmitting(false); }
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
          <button className={view === "exam" ? "active" : ""} onClick={() => void openExam()}><Glyph>✓</Glyph>คลังข้อสอบ</button>
        </nav>
        <div className="side-note"><span>เป้าหมายสัปดาห์นี้</span><b>4 จาก 5 ชุด</b><div className="progress"><i style={{ width: "80%" }} /></div><small>เหลืออีก 1 ชุด</small></div>
        <div className="user-chip"><span className="avatar">{initials}</span><div><b>{name}</b><small>ผู้เตรียมสอบ</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setView("dashboard")}><span className="brand-mark">SQ</span><b>SkillQuest</b></button>
          <span className="today">วันเสาร์ที่ 11 กรกฎาคม <i className={`sync-status ${backendStatus}`}>{backendStatus === "online" ? "ซิงก์แล้ว" : backendStatus === "connecting" ? "กำลังเชื่อมต่อ" : "ออฟไลน์"}</i></span>
          <div className="top-summary"><span><b>12</b> วันต่อเนื่อง</span><span><b>12,450</b> คะแนน</span><span className="avatar small">{initials}</span></div>
        </header>

        {view === "dashboard" && <div className="page dashboard-page">
          <div className="welcome">
            <div><p>ภาพรวมการฝึก</p><h1>สวัสดี, {name}</h1><span>คุณกำลังพัฒนาได้ดี โดยเฉพาะความแม่นยำในภาษาอังกฤษ</span></div>
            <button className="primary" disabled={!examReady} onClick={() => void openExam()}>{loadingQuestions ? "กำลังโหลดข้อสอบ" : "เริ่มทำข้อสอบ"} <span>→</span></button>
          </div>

          <section className="focus-band">
            <div className="focus-copy"><span className="focus-icon">↗</span><div><small>คลังข้อสอบจาก Supabase</small><h2>{activeTestTitle}</h2><p>{selectedTest.subject} · {selectedTest.question_count || questions.length} ข้อ · เวลาฝึกแนะนำ {Math.round((selectedTest.duration || 0) / 60)} นาที</p></div></div>
            <div className="test-actions">
              <label>
                <span>เลือกวิชา</span>
                <select
                  value={activeSubject}
                  disabled={loadingQuestions || subjectOptions.length === 0}
                  onChange={(event) => chooseSubjectOption(event.target.value)}
                  aria-label="เลือกวิชา"
                >
                  {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                </select>
              </label>
              <label>
                <span>เลือกชุดตาม Category</span>
                <select
                  value={activeTestId}
                  disabled={loadingQuestions || categoryOptions.length === 0}
                  onChange={(event) => chooseTestOption(event.target.value)}
                  aria-label="เลือกชุดข้อสอบ"
                >
                  {categoryOptions.map((test) => <option key={test.test_id} value={test.test_id}>ชุดที่ {test.category} ({test.question_count} ข้อ)</option>)}
                </select>
              </label>
              <button disabled={!examReady} onClick={() => void openExam()}>{loadingQuestions ? "กำลังโหลด…" : "เริ่มชุดนี้"}</button>
            </div>
          </section>

          <section className="metric-row" aria-label="สถิติสำคัญ">
            <article><span>คะแนนเฉลี่ย</span><b>{averageAccuracy}%</b><small className="positive">คำนวณจากผลที่ส่งสำเร็จ</small></article>
            <article><span>เวลาฝึกที่ซิงก์แล้ว</span><b>{totalSeconds ? `${(totalSeconds / 3600).toFixed(1)} ชม.` : "—"}</b><small>เวลาพักไม่นำมาคำนวณ</small></article>
            <article><span>ทำข้อสอบแล้ว</span><b>{syncedAttemptsCount || (backendStatus === "online" ? 0 : 24)} ชุด</b><small>{backendStatus === "online" ? "สรุปจาก Log และผลส่งสำเร็จ" : "กำลังใช้ข้อมูลตัวอย่าง"}</small></article>
            <article><span>อันดับปัจจุบัน</span><b>{remoteLeaders.length ? `#${Math.max(1, remoteLeaders.findIndex((item) => item.display_name === name) + 1)}` : "#3"}</b><small className="positive">อันดับจากผลที่ผ่านการตรวจคะแนน</small></article>
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
            <div className="subject-list">{subjectMastery.map((s) => <div className="subject-row" key={s.name}><div><b>{s.name}</b><small className="positive">{s.delta}</small></div><div className="progress"><i className={s.color} style={{ width: `${s.mastery}%` }} /></div><strong>{s.mastery}%</strong></div>)}</div>
          </section>

          <section className="panel history-card"><div className="section-heading"><div><h2>ประวัติล่าสุด</h2><p>ผู้ปกครองสามารถดูความสม่ำเสมอและผลการฝึกได้จากที่นี่</p></div><button className="text-button">ดูทั้งหมด</button></div><div className="history-table"><div className="history-head"><span>วันที่</span><span>ชุดข้อสอบ</span><span>คะแนน</span><span>ความแม่นยำ</span><span>เวลาที่ใช้</span><span>สถานะ</span></div>{(remoteHistory.length ? remoteHistory : history).map((h) => <div className="history-row" key={`${h.set}-${h.date}`}><span>{h.date}</span><span><b>{h.subject}</b><small>{h.set}</small></span><span>{h.score}</span><span>{h.accuracy}</span><span>{h.time}</span><span className={h.status === "สำเร็จ" ? "status success" : "status cancelled"}>{h.status}</span></div>)}</div></section>

          {backendMessage && <p className="system-note" role="status">{backendMessage}</p>}
          <section className="profile-settings"><div><span className="avatar large">{initials}</span><div><h2>ชื่อที่ใช้แสดงคะแนน</h2><p>ชื่อนี้จะแสดงในอันดับและรายงานผล ระบบสร้างเพียงรหัสนิรนามเบื้องหลัง</p></div></div>{editingName ? <form onSubmit={(e) => { e.preventDefault(); void saveName(); }}><input autoFocus value={name} maxLength={24} minLength={2} onChange={(e) => setName(e.target.value)} aria-label="ชื่อที่ใช้แสดง"/><button className="primary" type="submit">บันทึก</button></form> : <button className="secondary" onClick={() => setEditingName(true)}>เปลี่ยนชื่อ</button>}</section>
        </div>}

        {view === "ranking" && <div className="page ranking-page">
          <div className="welcome"><div><p>อันดับประจำสัปดาห์</p><h1>ความสม่ำเสมอพาไปข้างหน้า</h1><span>คะแนนอันดับคิดจากความแม่นยำ ความเร็ว และพัฒนาการ ไม่ใช่คะแนนดิบอย่างเดียว</span></div><div className="season"><small>สิ้นสุดฤดูกาลใน</small><b>12 วัน 08:42:19</b></div></div>
          <section className="rank-summary"><div><span>อันดับของคุณ</span><b>#3</b><small>Top 12% ของกลุ่ม</small></div><div><span>ระดับปัจจุบัน</span><b>Platinum III</b><small>อีก 550 คะแนนถึง Diamond</small></div><div><span>พัฒนาการสัปดาห์นี้</span><b className="positive">+12%</b><small>อันดับดีขึ้น 2 ตำแหน่ง</small></div></section>
          <section className="panel leaderboard"><div className="section-heading"><div><h2>ผู้ฝึกที่โดดเด่น</h2><p>แสดงเฉพาะคะแนนที่ตรวจจากฐานข้อมูลแล้ว</p></div><span className="updated">{backendStatus === "online" ? "ข้อมูลล่าสุด" : "ข้อมูลตัวอย่าง"}</span></div><div className="leader-list">{remoteLeaders.length ? remoteLeaders.map((l, i) => { const me = l.display_name === name; return <div className={`leader-row ${me ? "me" : ""}`} key={l.public_id}><span className={`position p${i + 1}`}>{l.rank_position}</span><span className="avatar">{l.display_name.slice(0, 1).toUpperCase()}</span><span className="leader-name"><b>{l.display_name}{me && " (คุณ)"}</b><small>{i < 2 ? "Diamond" : i < 4 ? "Platinum" : "Gold"}</small></span><span className="gain">{Math.round(Number(l.accuracy_avg))}%</span><span className="leader-points"><b>{Number(l.ranking_points).toLocaleString()}</b><small>คะแนนอันดับ</small></span></div> }) : leaders.map((l, i) => <div className={`leader-row ${l.me ? "me" : ""}`} key={l.name}><span className={`position p${i + 1}`}>{i + 1}</span><span className="avatar">{l.me ? initials : l.initials}</span><span className="leader-name"><b>{l.me ? name : l.name}{l.me && " (คุณ)"}</b><small>{i < 2 ? "Diamond" : i < 4 ? "Platinum" : "Gold"}</small></span><span className="gain">{l.gain}</span><span className="leader-points"><b>{l.points}</b><small>คะแนนอันดับ</small></span></div>)}</div></section>
          <section className="ranking-note"><h2>ระบบคิดคะแนนอย่างไร</h2><p>ระบบให้ความสำคัญกับการฝึกที่มีคุณภาพ คะแนนมาจากความแม่นยำ 40% ความเร็ว 25% การทำครบ 20% และพัฒนาการ 15% เพื่อให้ทุกคนมีโอกาสขยับอันดับได้จากการพัฒนาตัวเอง</p></section>
        </div>}

        {view === "exam" && <div className="exam-page">
          <header className="exam-header"><div><button className="back-link" onClick={() => { void syncQuestionLog(current, "pause", "paused"); setRunning(false); setView("dashboard"); }}>← กลับภาพรวม</button><h1>{activeTestTitle}</h1></div><div className="exam-metrics"><div><small>เวลาที่ทำจริง</small><b><i className={running ? "live-dot" : "live-dot paused"}/>{formatTime(seconds)}</b></div><div><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></div><button className="secondary" onClick={() => { void syncQuestionLog(current, "pause", "paused"); setRunning(false); setResumeOpen(true); }}>พักข้อสอบ</button></div></header>
          <div className="exam-body"><aside className="question-nav"><div><h2>รายการข้อ</h2><span>{remaining} ข้อยังไม่ตอบ</span></div><div className="question-grid">{questions.map((_, i) => { const state = i === current ? "current" : answers[i] !== undefined ? "answered" : states[i] === "paused" ? "skipped" : "empty"; return <button key={i} className={state} onClick={() => goTo(i)} aria-label={`ไปข้อ ${i + 1}`}>{i + 1}</button>; })}</div><div className="question-legend"><span><i className="answered"/>ตอบแล้ว</span><span><i className="skipped"/>ข้ามไว้</span><span><i className="current"/>ข้อปัจจุบัน</span></div></aside>
            <section className="question-stage"><div className="question-status"><span>ข้อ {current + 1} จาก {questions.length}</span><span>{answers[current] !== undefined ? "ตอบแล้ว" : states[current] === "paused" ? "ข้ามไว้" : "กำลังทำ"}</span><span>ข้อนี้ {formatTime(currentQuestionSeconds)}</span><span className={`save-state ${saved ? "show" : ""}`}>✓ บันทึกแล้ว</span></div><article className="question-card"><small>{currentQuestion.subject} · {currentQuestion.category} · {currentQuestion.level}</small><h2>{currentQuestion.q}</h2>{currentQuestion.image && <img className="question-image" src={currentQuestion.image} alt={`รูปประกอบข้อ ${current + 1}`} loading="lazy" referrerPolicy="no-referrer" />}<p>เลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียว</p><div className="assist-row"><button className="hint-button" disabled={hinting || totalHintsUsed >= 2 || currentHints.length > 0 || backendStatus !== "online"} onClick={() => void handleHint()}>{hinting ? "กำลังตัดตัวเลือก…" : `Hint ${totalHintsUsed}/2`}</button><span>ตัดตัวเลือกผิด 2 ข้อ · หัก {hintPenalty.toFixed(1)} คะแนน</span></div>{currentHints.length > 0 && <div className="hint-stack" aria-live="polite">{currentHints.map((hint) => <p key={hint.hint_id}>{hint.hint_text}</p>)}</div>}<div className="choices">{currentQuestion.choices.map((choice, i) => { const eliminated = eliminatedChoices.has(i); return <button key={`${currentQuestion.id}-${i}`} disabled={eliminated} className={`${answers[current] === i ? "selected" : ""} ${eliminated ? "eliminated" : ""}`} onClick={() => choose(i)}><span>{String.fromCharCode(65 + i)}</span><b>{choice}</b><i>{eliminated ? "ตัดออก" : answers[current] === i ? "✓" : ""}</i></button>; })}</div></article>{backendMessage && <p className="system-note" role="status">{backendMessage}</p>}<div className="exam-footer"><button className="secondary" disabled={current === 0} onClick={() => goTo(current - 1)}>ย้อนกลับ</button><button className="skip" onClick={() => { void syncQuestionLog(current, "skip", "skipped"); setStates((p) => ({ ...p, [current]: "paused" })); if (current < questions.length - 1) goTo(current + 1); }}>ข้ามข้อนี้</button>{current < questions.length - 1 ? <button className="primary" onClick={() => goTo(current + 1)}>ข้อถัดไป →</button> : <button className="primary" disabled={submitting} onClick={() => void handleSubmit()}>{submitting ? "กำลังตรวจคะแนน…" : "ส่งข้อสอบ"}</button>}</div></section>
          </div>
        </div>}

        <nav className="mobile-nav" aria-label="เมนูบนมือถือ"><button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><Glyph>⌂</Glyph><span>ภาพรวม</span></button><button className={view === "ranking" ? "active" : ""} onClick={() => setView("ranking")}><Glyph>≋</Glyph><span>อันดับ</span></button><button className={view === "exam" ? "active" : ""} onClick={() => void openExam()}><Glyph>✓</Glyph><span>ข้อสอบ</span></button></nav>
      </section>

      {resumeOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="resume-title"><div className="modal"><span className="modal-icon">Ⅱ</span><h2 id="resume-title">พักการทำข้อสอบแล้ว</h2><p>คำตอบและเวลาที่ทำจริง <b>{formatTime(seconds)}</b> ถูกบันทึกไว้ เวลาระหว่างพักจะไม่ถูกนำมานับ</p><div className="resume-summary"><span><small>ชุดข้อสอบ</small><b>{activeTestTitle}</b></span><span><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></span></div><button className="primary full" onClick={() => { setResumeOpen(false); setView("exam"); setRunning(true); void syncQuestionLog(current, "enter", statusFor(current)); }}>ทำข้อสอบต่อ</button><button className="danger-link" onClick={() => { void syncQuestionLog(current, "pause", "paused"); resetAttemptState(); setResumeOpen(false); setView("dashboard"); }}>ยกเลิกชุดนี้</button></div></div>}
      {submitOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-title"><div className="modal"><span className="modal-icon warning">!</span><h2 id="submit-title">ยังเหลือ {remaining} ข้อ</h2><p>ตรวจคำตอบให้ครบก่อนส่ง เพื่อให้ระบบวิเคราะห์ผลได้แม่นยำ</p><div className="missing-list">{questions.map((_, i) => answers[i] === undefined && <button key={i} onClick={() => { setSubmitOpen(false); goTo(i); }}>ข้อ {i + 1}</button>)}</div><button className="primary full" onClick={() => { setSubmitOpen(false); const n = questions.findIndex((_, i) => answers[i] === undefined); if (n >= 0) goTo(n); }}>ไปข้อที่ยังไม่ตอบ</button><button className="danger-link neutral" onClick={() => setSubmitOpen(false)}>กลับไปตรวจคำตอบ</button></div></div>}
      {result && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title"><div className="modal"><span className="modal-icon result">✓</span><h2 id="result-title">ตรวจคะแนนเรียบร้อย</h2><p>คุณตอบถูก <b>{result.correct_count} จาก {result.total_questions} ข้อ</b> คะแนนหลังหัก Hint <b>{Number(result.score).toFixed(1)}</b></p><div className="resume-summary"><span><small>Hint ที่ใช้</small><b>{result.hint_count} ครั้ง (-{Number(result.hint_penalty).toFixed(1)})</b></span><span><small>คะแนนอันดับ</small><b>+{result.ranking_points}</b></span></div><button className="primary full" onClick={() => { setResult(null); setView("dashboard"); }}>กลับไปดูพัฒนาการ</button></div></div>}
    </main>
  );
}
