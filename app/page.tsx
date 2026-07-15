"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensureAnonymousSession,
  loadDashboardSummary,
  loadLearningInsights,
  loadRemoteTest,
  logQuestionActivity,
  loadRemoteAttempts,
  loadRemoteTests,
  requestRemoteHint,
  cancelRemoteTest,
  pauseRemoteTest,
  startRemoteTest,
  submitRemoteAttempt,
  type AttemptResult,
  type DashboardSummary,
  type HintResult,
  type LearningInsights,
  type QuestionLogEvent,
  type QuestionLogStatus,
  type RemoteAttempt,
  type RemoteTest,
  type RemoteTestPayload,
} from "@/lib/supabase";

type View = "dashboard" | "history" | "exam";
type QuestionState = "viewed" | "paused" | "answered" | "changed_answer" | "reviewed";
type ExamQuestion = {
  id: string;
  q: string;
  choices: string[];
  choiceImageIds: (string | null)[];
  choiceImages: (string | null)[];
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
  { id: "20000000-0000-4000-8000-000000000001", q: "ถ้า 3x + 7 = 22 แล้ว x มีค่าเท่าใด?", choices: ["3", "5", "7", "9"], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "พีชคณิต", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000002", q: "จำนวนใดเป็นจำนวนเฉพาะ?", choices: ["21", "27", "29", "33"], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "จำนวน", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000003", q: "พื้นที่ของสี่เหลี่ยมจัตุรัสด้านยาว 8 ซม. เท่ากับเท่าใด?", choices: ["16 ตร.ซม.", "32 ตร.ซม.", "64 ตร.ซม.", "80 ตร.ซม."], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "เรขาคณิต", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000004", q: "3/4 เขียนเป็นทศนิยมได้ข้อใด?", choices: ["0.25", "0.50", "0.75", "1.25"], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "เศษส่วน", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000005", q: "ค่าเฉลี่ยของ 6, 8 และ 10 เท่ากับเท่าใด?", choices: ["7", "8", "9", "10"], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "สถิติ", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000006", q: "มุมตรงมีขนาดกี่องศา?", choices: ["45°", "90°", "180°", "360°"], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "เรขาคณิต", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000007", q: "2⁵ มีค่าเท่าใด?", choices: ["10", "16", "25", "32"], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "เลขยกกำลัง", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000008", q: "จำนวนถัดไปของ 2, 4, 8, 16 คือข้อใด?", choices: ["18", "24", "30", "32"], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "ลำดับ", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000009", q: "รากที่สองของ 144 คือข้อใด?", choices: ["10", "11", "12", "14"], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "รากที่สอง", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000010", q: "15% ของ 200 เท่ากับเท่าใด?", choices: ["15", "20", "30", "45"], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "ร้อยละ", level: "ระดับพื้นฐาน", image: null },
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
  categoryId?: string;
  sessionId?: string;
  pauseStartedAt?: string;
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

function readInitialNonce() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("skillquest-attempt-nonce") ?? crypto.randomUUID();
}

function formatTime(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatDurationShort(total: number) {
  if (!total) return "—";
  if (total < 60) return `${total} วิ`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m}น ${s}วิ` : `${m}น`;
}

function formatDurationLong(total: number) {
  if (!total) return "—";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m || h) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function formatPace(total: number) {
  if (!total) return "—";
  const rounded = Math.max(1, Math.round(total));
  if (rounded < 60) return `${rounded}s/ข้อ`;
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}m ${s}s/ข้อ`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isExternalImage(url: string | null | undefined) {
  return Boolean(url && /^https?:\/\//i.test(url));
}

function proxiedImageUrl(kind: "question" | "answer", id: string, rawUrl: string | null | undefined) {
  if (!rawUrl) return "";
  if (!isExternalImage(rawUrl)) return rawUrl;
  const base = "https://pttsjpmwvppkaacgzdqh.supabase.co/functions/v1/skillquest-image";
  return `${base}?kind=${kind}&id=${encodeURIComponent(id)}`;
}

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

type HistoryRow = {
  date: string;
  subject: string;
  set: string;
  score: string;
  accuracy: string;
  time: string;
  status: string;
};

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  if (!rows.length) {
    return <div className="table-empty history-empty">ยังไม่มีประวัติที่ส่งสำเร็จ เมื่อทำข้อสอบครบและกดส่ง ระบบจะแสดงผลล่าสุดไว้ที่นี่อัตโนมัติ</div>;
  }
  return <div className="history-table">
    <div className="history-head"><span>วันที่</span><span>ชุดข้อสอบ</span><span>คะแนน</span><span>ความแม่นยำ</span><span>เวลาที่ใช้</span><span>สถานะ</span></div>
    {rows.map((h) => <div className="history-row" key={`${h.set}-${h.date}-${h.score}`}>
      <span>{h.date}</span><span><b>{h.subject}</b><small>{h.set}</small></span><span>{h.score}</span><span>{h.accuracy}</span><span>{h.time}</span><span className="status success">{h.status}</span>
    </div>)}
  </div>;
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [current, setCurrent] = useState(() => readSavedAttempt()?.current ?? 0);
  const [answers, setAnswers] = useState<Record<number, number>>(() => readSavedAttempt()?.answers ?? defaultAnswers);
  const [states, setStates] = useState<Record<number, QuestionState>>(() => readSavedAttempt()?.states ?? defaultStates);
  const [seconds, setSeconds] = useState(() => readSavedAttempt()?.seconds ?? 0);
  const [running, setRunning] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(() => Boolean(readSavedAttempt()?.sessionId));
  const [pauseStartedAt, setPauseStartedAt] = useState(() => readSavedAttempt()?.pauseStartedAt ?? "");
  const [pausedNow, setPausedNow] = useState(() => Date.now());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [range, setRange] = useState("30 วัน");
  const [saved, setSaved] = useState(false);
  const [clientNonce, setClientNonce] = useState(readInitialNonce);
  const [backendStatus, setBackendStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [backendMessage, setBackendMessage] = useState("");
  const [remoteAttempts, setRemoteAttempts] = useState<RemoteAttempt[]>([]);
  const [testOptions, setTestOptions] = useState<RemoteTest[]>([]);
  const [selectedTest, setSelectedTest] = useState<RemoteTest>(fallbackTest);
  const [activeSessionId, setActiveSessionId] = useState(() => readSavedAttempt()?.sessionId ?? "");
  const [pendingTest, setPendingTest] = useState<RemoteTest | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<View | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loadedTestId, setLoadedTestId] = useState("");
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [learningInsights, setLearningInsights] = useState<LearningInsights | null>(null);
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
  const activeSessionIdRef = useRef(activeSessionId);

  const answeredCount = Object.keys(answers).filter((key) => Number(key) < questions.length).length;
  const remaining = questions.length - answeredCount;
  const currentQuestionSeconds = questionSeconds[current] ?? 0;
  const totalHintsUsed = Object.values(hints).reduce((sum, item) => sum + item.length, 0);
  const hintPenalty = totalHintsUsed * 0.5;
  const currentHints = hints[current] ?? [];
  const eliminatedChoices = new Set(currentHints.flatMap((hint) => hint.eliminated_choices ?? []));
  const currentQuestion = questions[current] ?? questions[0] ?? fallbackQuestions[0];
  const selectedCategoryId = selectedTest.category_id || selectedTest.test_id;
  const activeTestId = activeSessionId;
  const activeTestTitle = selectedTest.title;
  const examReady = Boolean(selectedCategoryId) && !loadingQuestions;
  const activeSubject = selectedTest.subject;
  const subjectOptions = Array.from(new Set((testOptions.length ? testOptions : [fallbackTest]).map((test) => test.subject)));
  const categoryOptions = (testOptions.length ? testOptions : [fallbackTest]).filter((test) => test.subject === activeSubject);
  const touchedQuestions = questions.reduce((count, _, index) => (
    questionSeconds[index] > 0 || answers[index] !== undefined || states[index] !== undefined ? count + 1 : count
  ), 0);
  const averageActiveQuestionSeconds = touchedQuestions ? Math.round(seconds / touchedQuestions) : 0;
  const hasActiveAttempt = Boolean(activeSessionId) && (seconds > 0 || touchedQuestions > 0 || questions.length > 0);
  const pauseSeconds = pauseStartedAt ? Math.max(0, Math.floor((pausedNow - new Date(pauseStartedAt).getTime()) / 1000)) : 0;

  function normalizeRemoteTest(payload: RemoteTestPayload): ExamQuestion[] {
    return payload.questions.map((question) => ({
      id: question.id,
      q: question.question,
      choices: question.choices
        .slice()
        .sort((a, b) => a.choice_index - b.choice_index)
        .map((choice) => choice.answer),
      choiceImageIds: question.choices
        .slice()
        .sort((a, b) => a.choice_index - b.choice_index)
        .map((choice) => choice.answer_id),
      choiceImages: question.choices
        .slice()
        .sort((a, b) => a.choice_index - b.choice_index)
        .map((choice) => choice.image),
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

  function selectCatalogTest(nextTest: RemoteTest, clearAttempt = true) {
    setSelectedTest(nextTest);
    setActiveSessionId("");
    activeSessionIdRef.current = "";
    setQuestions([]);
    setLoadedTestId("");
    selectedTestRef.current = nextTest;
    questionsRef.current = [];
    if (clearAttempt) resetAttemptState();
    setBackendMessage("");
  }

  function chooseTestOption(testId: string) {
    const nextTest = (testOptions.length ? testOptions : [fallbackTest]).find((test) => test.test_id === testId);
    if (!nextTest) return;
    if (hasActiveAttempt && (nextTest.category_id || nextTest.test_id) !== selectedCategoryId) {
      setPendingTest(nextTest);
      setReplaceOpen(true);
      return;
    }
    selectCatalogTest(nextTest, true);
  }

  function chooseSubjectOption(subject: string) {
    const nextTest = (testOptions.length ? testOptions : [fallbackTest]).find((test) => test.subject === subject);
    if (nextTest) chooseTestOption(nextTest.test_id);
  }

  useEffect(() => {
    void (async () => {
      try {
        await ensureAnonymousSession("ผู้ใช้งานหลัก");
        const [attemptRows, testRows, summary, insights] = await Promise.all([loadRemoteAttempts(), loadRemoteTests(), loadDashboardSummary(), loadLearningInsights()]);
        setRemoteAttempts(attemptRows);
        setDashboardSummary(summary);
        setLearningInsights(insights);
        setTestOptions(testRows);
        const savedCategoryId = readSavedAttempt()?.categoryId ?? readSavedAttempt()?.testId;
        const nextTest = testRows.find((test) => (test.category_id || test.test_id) === savedCategoryId) ?? testRows[0];
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
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId, answers, current, questionSeconds, questions, selectedTest, states]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setSeconds((s) => s + 1);
      setQuestionSeconds((items) => ({ ...items, [current]: (items[current] ?? 0) + 1 }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [current, running]);

  useEffect(() => {
    if (!resumeOpen || !pauseStartedAt) return;
    setPausedNow(Date.now());
    const timer = window.setInterval(() => setPausedNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pauseStartedAt, resumeOpen]);

  useEffect(() => {
    if (!running || backendStatus !== "online" || !clientNonce) return;
    const heartbeat = window.setInterval(() => {
      void syncQuestionLog(currentRef.current, "heartbeat");
    }, 8000);
    return () => window.clearInterval(heartbeat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendStatus, clientNonce, running]);

  useEffect(() => {
    const persistPausedExit = () => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) return;
      const pausedAt = new Date().toISOString();
      try {
        const prior = JSON.parse(localStorage.getItem("skillquest-attempt") ?? "{}") as SavedAttempt;
        localStorage.setItem("skillquest-attempt", JSON.stringify({ ...prior, sessionId, status: "paused", pauseStartedAt: pausedAt }));
      } catch {
        // Local recovery is best-effort; the active session remains on the server.
      }
      if (backendStatus === "online") void pauseRemoteTest(sessionId).catch(() => undefined);
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!running) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", persistPausedExit);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", persistPausedExit);
    };
  }, [backendStatus, running]);

  useEffect(() => {
    if (clientNonce) localStorage.setItem("skillquest-attempt-nonce", clientNonce);
    localStorage.setItem("skillquest-attempt", JSON.stringify({ answers, states, current, seconds, questionSeconds, hints, testId: activeTestId, categoryId: selectedCategoryId, sessionId: activeSessionId, status: running ? "in_progress" : "paused", pauseStartedAt }));
    const showTimer = window.setTimeout(() => setSaved(true), 0);
    const hideTimer = window.setTimeout(() => setSaved(false), 900);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [activeTestId, activeSessionId, answers, states, current, seconds, questionSeconds, hints, running, clientNonce, selectedCategoryId, pauseStartedAt]);

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
  const remoteHistory = remoteAttempts
    .slice()
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    .map((item) => ({
    date: new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(item.submitted_at)),
    subject: item.Test?.Subject ?? "แบบทดสอบ",
    set: item.Test?.Question ?? "ชุดฝึก",
    score: `${item.correct_count}/${item.total_questions}`,
    accuracy: `${Math.round(Number(item.accuracy))}%`,
    time: formatDurationLong(item.elapsed_seconds),
    status: "สำเร็จ",
  }));
  const insightOverview = learningInsights?.overview;
  const hasInsightData = Boolean(insightOverview && insightOverview.questions_seen > 0);
  const subjectTimeRows = learningInsights?.subjects ?? [];
  const categoryInsightRows = (learningInsights?.categories ?? []).slice(0, 8);
  const slowQuestionRows = learningInsights?.slow_questions ?? [];
  const insightRecommendations = learningInsights?.recommendations ?? [];
  const maxSubjectSeconds = Math.max(1, ...subjectTimeRows.map((item) => Number(item.total_seconds) || 0));
  const maxCategoryAvg = Math.max(1, ...categoryInsightRows.map((item) => Number(item.avg_seconds) || 0));
  const speedTarget = 75;
  const averageQuestionSeconds = Number(insightOverview?.avg_seconds_per_question ?? 0);
  const medianQuestionSeconds = Number(insightOverview?.median_seconds_per_question ?? 0);
  const insightPaceLabel = averageQuestionSeconds
    ? averageQuestionSeconds <= speedTarget ? "อยู่ในจังหวะดี" : averageQuestionSeconds <= 120 ? "ควรเร่งจังหวะเล็กน้อย" : "ช้ากว่าเป้าหมายมาก"
    : "รอข้อมูลจาก Log";

  function statusFor(index: number): QuestionLogStatus {
    if (answersRef.current[index] !== undefined) return statesRef.current[index] === "changed_answer" ? "changed_answer" : "answered";
    if (statesRef.current[index] === "paused") return "skipped";
    return "viewed";
  }

  async function syncQuestionLog(index: number, eventType: QuestionLogEvent, status?: QuestionLogStatus, quiet = true) {
    const activeQuestions = questionsRef.current;
    const sessionId = activeSessionIdRef.current;
    if (backendStatus !== "online" || !clientNonce || !activeQuestions[index] || !sessionId) return;
    try {
      await logQuestionActivity({
        set_id: sessionId,
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

  async function startFreshExam(test: RemoteTest, nonce: string) {
    const categoryId = test.category_id || test.test_id;
    try {
      const started = await startRemoteTest(categoryId, nonce);
      setActiveSessionId(started.test_id);
      activeSessionIdRef.current = started.test_id;
      setSelectedTest(started);
      selectedTestRef.current = started;
      const ok = await loadExamTest(started.test_id);
      if (!ok && backendStatus === "online") return false;
      setView("exam");
      setRunning(true);
      window.setTimeout(() => void syncQuestionLog(0, "enter", "viewed"), 0);
      return true;
    } catch {
      setBackendMessage("เริ่มทำข้อสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return false;
    }
  }

  function requestStartExam() {
    if (!examReady) {
      setBackendMessage("กำลังโหลดชุดข้อสอบ กรุณารอสักครู่");
      return;
    }
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      setStartOpen(true);
      return;
    }
    void openExam();
  }

  async function confirmStartExam() {
    const nextNonce = crypto.randomUUID();
    setStartOpen(false);
    resetAttemptState(true, nextNonce);
    await startFreshExam(selectedTestRef.current, nextNonce);
  }

  async function openExam() {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId) {
      requestStartExam();
      return;
    }
    if (loadedTestId !== sessionId || questions.length === 0) {
      const ok = await loadExamTest(sessionId);
      if (!ok && backendStatus === "online") return;
    }
    setView("exam");
    if (pauseStartedAt || resumeOpen) {
      setResumeOpen(true);
      return;
    }
    setRunning(true);
    void syncQuestionLog(current, "enter", statusFor(current));
  }

  async function pauseExam() {
    const sessionId = activeSessionIdRef.current;
    if (!sessionId || !running) return;
    const localPausedAt = new Date().toISOString();
    setRunning(false);
    setPauseStartedAt(localPausedAt);
    setPausedNow(Date.now());
    setResumeOpen(true);
    await syncQuestionLog(currentRef.current, "pause", "paused", false);
    if (backendStatus !== "online") return;
    try {
      const paused = await pauseRemoteTest(sessionId);
      setPauseStartedAt(paused.paused_at || localPausedAt);
      setBackendMessage("");
    } catch {
      setBackendMessage("พักข้อสอบในเครื่องแล้ว แต่การบันทึกสถานะไปยังเซิร์ฟเวอร์ยังไม่สำเร็จ");
    }
  }

  function resumeExam() {
    setPauseStartedAt("");
    setResumeOpen(false);
    setView("exam");
    setRunning(true);
    void syncQuestionLog(currentRef.current, "enter", statusFor(currentRef.current), false);
  }

  function requestNavigation(nextView: View) {
    if (nextView === view) return;
    if (view === "exam" && activeSessionIdRef.current) {
      setNavigationTarget(nextView);
      setLeaveOpen(true);
      return;
    }
    setView(nextView);
  }

  async function cancelAttempt() {
    const destination = navigationTarget ?? "dashboard";
    setCancelling(true);
    try {
      await syncQuestionLog(currentRef.current, "pause", "paused", false);
      if (backendStatus === "online" && activeSessionIdRef.current) await cancelRemoteTest(activeSessionIdRef.current);
      resetAttemptState();
      setRunning(false);
      setPauseStartedAt("");
      setResumeOpen(false);
      setCancelOpen(false);
      setLeaveOpen(false);
      setNavigationTarget(null);
      setView(destination);
      setBackendMessage("");
    } catch {
      setBackendMessage("ยกเลิกข้อสอบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
    } finally {
      setCancelling(false);
    }
  }

  async function confirmReplaceAttempt() {
    if (!pendingTest) return;
    setRunning(false);
    if (activeSessionIdRef.current) {
      await cancelRemoteTest(activeSessionIdRef.current).catch(() => undefined);
    }
    const nextTest = pendingTest;
    const nextNonce = crypto.randomUUID();
    resetAttemptState(true, nextNonce);
    setPendingTest(null);
    setReplaceOpen(false);
    setSelectedTest(nextTest);
    selectedTestRef.current = nextTest;
    await startFreshExam(nextTest, nextNonce);
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
  function resetAttemptState(clearResult = true, forcedNonce?: string) {
    const nextNonce = forcedNonce ?? crypto.randomUUID();
    localStorage.removeItem("skillquest-attempt");
    localStorage.setItem("skillquest-attempt-nonce", nextNonce);
    setClientNonce(nextNonce);
    setActiveSessionId("");
    activeSessionIdRef.current = "";
    setLoadedTestId("");
    setAnswers({});
    setStates({});
    setCurrent(0);
    setSeconds(0);
    setQuestionSeconds({});
    setHints({});
    setPauseStartedAt("");
    if (clearResult) setResult(null);
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
      const [attemptRows, summary, insights] = await Promise.all([loadRemoteAttempts(), loadDashboardSummary(), loadLearningInsights()]);
      setRemoteAttempts(attemptRows);
      setDashboardSummary(summary);
      setLearningInsights(insights);
      resetAttemptState(false);
    } catch (error) {
      setRunning(true);
      setBackendMessage(error instanceof Error && error.message === "RATE_LIMITED" ? "ส่งข้อสอบถี่เกินไป กรุณารอสักครู่" : "ส่งผลไม่สำเร็จ คำตอบยังอยู่ในเครื่องและลองใหม่ได้");
    } finally { setSubmitting(false); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => requestNavigation("dashboard")} aria-label="ไปหน้าภาพรวม">
          <span className="brand-mark">SQ</span><span><b>SkillQuest</b><small>PREP ACADEMY</small></span>
        </button>
        <nav aria-label="เมนูหลัก">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => requestNavigation("dashboard")}><Glyph>⌂</Glyph>ภาพรวม</button>
          <button className={view === "history" ? "active" : ""} onClick={() => requestNavigation("history")}><Glyph>◷</Glyph>ประวัติการฝึก</button>
          <button className={view === "exam" ? "active" : ""} onClick={() => void requestStartExam()}><Glyph>✓</Glyph>คลังข้อสอบ</button>
        </nav>
        <div className="side-note"><span>เป้าหมายสัปดาห์นี้</span><b>4 จาก 5 ชุด</b><div className="progress"><i style={{ width: "80%" }} /></div><small>เหลืออีก 1 ชุด</small></div>
        <div className="user-chip"><span className="avatar">1</span><div><b>โหมดผู้ใช้เดียว</b><small>ใช้งานได้ทันที</small></div></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => requestNavigation("dashboard")}><span className="brand-mark">SQ</span><b>SkillQuest</b></button>
          <span className="today">วันเสาร์ที่ 11 กรกฎาคม <i className={`sync-status ${backendStatus}`}>{backendStatus === "online" ? "ซิงก์แล้ว" : backendStatus === "connecting" ? "กำลังเชื่อมต่อ" : "ออฟไลน์"}</i></span>
          <div className="top-summary"><span><b>{syncedAttemptsCount}</b> ชุดสำเร็จ</span><span><b>{formatDurationLong(totalSeconds)}</b> เวลาฝึก</span><span className="avatar small">1</span></div>
        </header>

        {view === "dashboard" && <div className="page dashboard-page">
          <div className="welcome">
            <div><p>ภาพรวมการฝึกส่วนตัว</p><h1>Dashboard สำหรับผู้เตรียมสอบคนเดียว</h1><span>สรุปจากผลที่ส่งสำเร็จและ Log รายข้อ เพื่อดูความแม่นยำ เวลา และหมวดที่ควรทบทวน</span></div>
            <button className="primary" disabled={!examReady} onClick={() => void requestStartExam()}>{loadingQuestions ? "กำลังโหลดข้อสอบ" : "เริ่มทำข้อสอบ"} <span>→</span></button>
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
                  value={selectedCategoryId}
                  disabled={loadingQuestions || categoryOptions.length === 0}
                  onChange={(event) => chooseTestOption(event.target.value)}
                  aria-label="เลือกชุดข้อสอบ"
                >
                  {categoryOptions.map((test) => <option key={test.test_id} value={test.test_id}>ชุดที่ {test.category} ({test.question_count} ข้อ)</option>)}
                </select>
              </label>
              <button disabled={!examReady} onClick={() => void requestStartExam()}>{loadingQuestions ? "กำลังโหลด…" : "เริ่มชุดนี้"}</button>
            </div>
          </section>

          <section className="metric-row" aria-label="สถิติสำคัญ">
            <article><span>ความแม่นยำเฉลี่ย</span><b>{averageAccuracy}%</b><small className="positive">คำนวณจากชุดที่ส่งสำเร็จ</small></article>
            <article><span>เวลาทำข้อสอบรวม</span><b>{formatDurationLong(totalSeconds)}</b><small>นับเฉพาะเวลาที่ Active ไม่รวมพัก</small></article>
            <article><span>ทำข้อสอบแล้ว</span><b>{syncedAttemptsCount || (backendStatus === "online" ? 0 : 24)} ชุด</b><small>{backendStatus === "online" ? "สรุปจาก Log และผลส่งสำเร็จ" : "กำลังใช้ข้อมูลตัวอย่าง"}</small></article>
            <article><span>ข้อที่มี Log</span><b>{Number(dashboardSummary?.answered_logs ?? 0).toLocaleString()}</b><small className="positive">ใช้วิเคราะห์จุดแข็ง/จุดอ่อน</small></article>
          </section>

          <section className="insight-board" aria-label="แดชบอร์ดวิเคราะห์การฝึก">
            <article className="panel insight-hero">
              <div className="section-heading"><div><h2>Training Insight</h2><p>วิเคราะห์จาก Log รายข้อ ไม่ดึงข้อสอบทั้งหมดขึ้นหน้าเว็บ</p></div><span className={`insight-state ${hasInsightData ? "ready" : ""}`}>{hasInsightData ? "พร้อมวิเคราะห์" : "รอข้อมูล"}</span></div>
              <div className="insight-metrics">
                <div><span>ความเร็วเฉลี่ย</span><b>{formatPace(averageQuestionSeconds)}</b><small>{insightPaceLabel}</small></div>
                <div><span>มัธยฐานความเร็ว</span><b>{formatPace(medianQuestionSeconds)}</b><small>กันข้อที่นานผิดปกติ</small></div>
                <div><span>ข้อที่มี Log</span><b>{Number(insightOverview?.questions_seen ?? 0).toLocaleString()}</b><small>นับเฉพาะข้อที่เคยเปิดทำ</small></div>
                <div><span>Hint ที่ใช้</span><b>{Number(insightOverview?.hint_count ?? 0)}</b><small>ช่วยดูการพึ่งตัวช่วย</small></div>
              </div>
              {!hasInsightData && <div className="insight-empty"><b>ยังไม่มี Insight รายข้อ</b><span>เริ่มทำข้อสอบและกดส่งผล ระบบจะสะสมเวลาแต่ละข้อ หมวดที่ช้า และข้อที่ควรทบทวนให้อัตโนมัติ</span></div>}
              {hasInsightData && <div className="coach-list">
                {(insightRecommendations.length ? insightRecommendations : [{ title: "ภาพรวมยังปกติ", body: "ยังไม่พบหมวดที่เสี่ยงเด่นชัด ให้ทำเพิ่มอีก 1–2 ชุดเพื่อให้โมเดล insight แม่นขึ้น", priority: "low", type: "speed" }]).map((item) => <div className={`coach-item ${item.priority}`} key={`${item.type}-${item.title}`}><span>{item.priority === "high" ? "!" : "i"}</span><div><b>{item.title}</b><small>{item.body}</small></div></div>)}
              </div>}
            </article>

            <article className="panel subject-time-card">
              <div className="section-heading"><div><h2>เวลาตามวิชา</h2><p>รวมเวลาจริงจากข้อที่ Active</p></div></div>
              <div className="time-list">
                {(subjectTimeRows.length ? subjectTimeRows : subjectMastery.map((item) => ({ subject: item.name, total_seconds: 0, avg_seconds: 0, accuracy: item.mastery, questions_seen: 0, wrong_count: 0, scored_count: 0 }))).map((item) => <div className="time-row" key={item.subject}>
                  <div><b>{item.subject}</b><small>{item.questions_seen} ข้อ · เฉลี่ย {formatPace(Number(item.avg_seconds))}</small></div>
                  <div className="time-track"><i style={{ width: `${Math.max(6, (Number(item.total_seconds) / maxSubjectSeconds) * 100)}%` }} /></div>
                  <strong>{formatDurationLong(Number(item.total_seconds))}</strong>
                </div>)}
              </div>
            </article>
          </section>

          <section className="insight-grid">
            <article className="panel category-diagnosis">
              <div className="section-heading"><div><h2>วิเคราะห์ตามหมวด / ชุด</h2><p>จัดลำดับจากข้อผิด เวลาเฉลี่ย และเวลารวม</p></div></div>
              <div className="diagnosis-table">
                <div className="diagnosis-head"><span>หมวด</span><span>ความแม่น</span><span>เฉลี่ย/ข้อ</span><span>จุดสังเกต</span></div>
                {(categoryInsightRows.length ? categoryInsightRows : []).map((item) => {
                  const accuracy = clampPercent(Number(item.accuracy));
                  const avg = Number(item.avg_seconds) || 0;
                  const note = item.wrong_count > 0 ? `ผิด ${item.wrong_count} ข้อ` : avg > speedTarget ? "ช้ากว่าเป้า" : "จังหวะดี";
                  return <div className="diagnosis-row" key={`${item.subject}-${item.category}`}>
                    <span><b>{item.subject}</b><small>ชุดที่ {item.category} · {item.questions_seen} ข้อ</small></span>
                    <span>{item.scored_count ? `${accuracy}%` : "—"}</span>
                    <span>{formatPace(avg)}</span>
                    <span className={item.wrong_count > 0 || avg > speedTarget ? "warn" : "ok"}>{note}</span>
                    <i style={{ width: `${Math.max(8, (avg / maxCategoryAvg) * 100)}%` }} />
                  </div>;
                })}
                {!categoryInsightRows.length && <div className="table-empty">ยังไม่มีหมวดที่วิเคราะห์ได้ ลองทำข้อสอบให้จบอย่างน้อย 1 ชุด</div>}
              </div>
            </article>

            <article className="panel slow-question-card">
              <div className="section-heading"><div><h2>ข้อที่ควรกลับไปดู</h2><p>เรียงจากเวลานานและความเสี่ยงตอบผิด</p></div></div>
              <div className="watch-list">
                {slowQuestionRows.slice(0, 5).map((item, index) => <div className="watch-item" key={item.question_id}>
                  <span>{index + 1}</span>
                  <div><b>{item.subject} · ชุดที่ {item.category}</b><p>{item.question}</p><small>{formatDurationLong(Number(item.duration_seconds))} · {item.reason}</small></div>
                </div>)}
                {!slowQuestionRows.length && <div className="table-empty">ยังไม่มีข้อที่ใช้เวลานาน ระบบจะเริ่มจัด watchlist หลังมี Log รายข้อ</div>}
              </div>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel trend-card">
              <div className="section-heading"><div><h2>พัฒนาการคะแนน</h2><p>ค่าเฉลี่ยจากข้อสอบที่ส่งสำเร็จ</p></div><select value={range} onChange={(e) => setRange(e.target.value)} aria-label="เลือกช่วงเวลา"><option>30 วัน</option><option>90 วัน</option></select></div>
              <div className="trend-plot"><div className="axis"><span>100</span><span>75</span><span>50</span><span>25</span></div><svg viewBox="0 0 336 100" preserveAspectRatio="none" role="img" aria-label="กราฟคะแนนมีแนวโน้มสูงขึ้น"><polyline points={chartPoints} /></svg><div className="dates"><span>12 มิ.ย.</span><span>20 มิ.ย.</span><span>28 มิ.ย.</span><span>6 ก.ค.</span><span>วันนี้</span></div></div>
            </article>
            <article className="panel next-card"><div className="section-heading"><div><h2>เป้าหมายถัดไป</h2><p>โฟกัสจากผลล่าสุด</p></div><span className="level-badge">Personal</span></div><div className="ring"><b>{averageAccuracy || 0}%</b><span>Accuracy</span></div><p>เป้าหมายที่เหมาะตอนนี้คือทำให้ครบอย่างน้อย 1 ชุด แล้วดูหมวดที่ใช้เวลานานหรือผิดซ้ำจาก Insight รายข้อ</p><div className="next-checks"><span className="done">✓ เก็บเวลาแยกรายข้อ</span><span>○ ส่งข้อสอบให้ครบทุกข้อ</span><span>○ ทบทวนหมวดที่ช้ากว่าเป้า</span></div></article>
          </section>

          <section className="panel mastery-card">
            <div className="section-heading"><div><h2>ความชำนาญรายวิชา</h2><p>เทียบกับผลการฝึก 30 วันที่ผ่านมา</p></div><button className="text-button">ดูรายละเอียด</button></div>
            <div className="subject-list">{subjectMastery.map((s) => <div className="subject-row" key={s.name}><div><b>{s.name}</b><small className="positive">{s.delta}</small></div><div className="progress"><i className={s.color} style={{ width: `${s.mastery}%` }} /></div><strong>{s.mastery}%</strong></div>)}</div>
          </section>

          <section className="panel history-card"><div className="section-heading"><div><h2>ประวัติล่าสุด</h2><p>แสดงเฉพาะชุดที่ส่งสำเร็จ เรียงจากล่าสุดไปเก่าสุด</p></div><button className="text-button" onClick={() => setView("history")}>ดูทั้งหมด</button></div><HistoryTable rows={remoteHistory.slice(0, 5)} /></section>

          {backendMessage && <p className="system-note" role="status">{backendMessage}</p>}
        </div>}

        {view === "history" && <div className="page history-page">
          <div className="welcome"><div><p>ประวัติการฝึก</p><h1>ผลสอบที่ส่งสำเร็จทั้งหมด</h1><span>เรียงจากวันล่าสุดไปเก่าสุด และไม่แสดงชุดที่ถูกยกเลิกหรือพักค้างไว้</span></div><button className="secondary" onClick={() => requestNavigation("dashboard")}>กลับภาพรวม</button></div>
          <section className="panel history-card"><div className="section-heading"><div><h2>รายการประวัติ</h2><p>{remoteHistory.length ? `${remoteHistory.length} ชุดที่ส่งสำเร็จ` : "ยังไม่มีผลสอบที่ส่งสำเร็จ"}</p></div><span className="updated">{backendStatus === "online" ? "ข้อมูลล่าสุดจาก Supabase" : "ออฟไลน์"}</span></div><HistoryTable rows={remoteHistory} /></section>
        </div>}

        {view === "exam" && <div className="exam-page">
          <header className="exam-header"><div><button className="back-link" onClick={() => requestNavigation("dashboard")}>← กลับภาพรวม</button><h1>{activeTestTitle}</h1></div><div className="exam-metrics"><div><small>เวลาที่ทำจริง</small><b><i className={running ? "live-dot" : "live-dot paused"}/>{formatTime(seconds)}</b></div><div><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></div></div><button className="secondary pause-button" onClick={() => void pauseExam()} disabled={!running}>พักข้อสอบ</button></header>
          <div className="exam-body"><aside className="question-nav"><div><h2>รายการข้อ</h2><span>{remaining} ข้อยังไม่ตอบ</span></div><div className="question-grid">{questions.map((_, i) => { const state = i === current ? "current" : answers[i] !== undefined ? "answered" : states[i] === "paused" ? "skipped" : "empty"; return <button key={i} className={state} onClick={() => goTo(i)} aria-label={`ไปข้อ ${i + 1}`}>{i + 1}</button>; })}</div><div className="question-legend"><span><i className="answered"/>ตอบแล้ว</span><span><i className="skipped"/>ข้ามไว้</span><span><i className="current"/>ข้อปัจจุบัน</span></div></aside>
            <section className="question-stage">
              <div className="question-status"><span>ข้อ {current + 1} จาก {questions.length}</span><span>{answers[current] !== undefined ? "ตอบแล้ว" : states[current] === "paused" ? "ข้ามไว้" : "กำลังทำ"}</span><span>ข้อนี้ {formatTime(currentQuestionSeconds)}</span><span className={`save-state ${saved ? "show" : ""}`}>✓ บันทึกแล้ว</span></div>
              <article className="question-card">
                <small>{currentQuestion.subject} · {currentQuestion.category} · {currentQuestion.level}</small>
                <h2>{currentQuestion.q}</h2>
                {currentQuestion.image && <img className="question-image" src={proxiedImageUrl("question", currentQuestion.id, currentQuestion.image)} alt={`รูปประกอบข้อ ${current + 1}`} loading="lazy" referrerPolicy="no-referrer" />}
                <p>เลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียว</p>
                <div className="assist-row"><button className="hint-button" disabled={hinting || totalHintsUsed >= 2 || currentHints.length > 0 || backendStatus !== "online"} onClick={() => void handleHint()}>{hinting ? "กำลังตัดตัวเลือก…" : `Hint ${totalHintsUsed}/2`}</button><span>ตัดตัวเลือกผิด 2 ข้อ · หัก {hintPenalty.toFixed(1)} คะแนน</span></div>
                {currentHints.length > 0 && <div className="hint-stack" aria-live="polite">{currentHints.map((hint) => <p key={hint.hint_id}>{hint.hint_text}</p>)}</div>}
                <div className="choices">{currentQuestion.choices.map((choice, i) => {
                  const eliminated = eliminatedChoices.has(i);
                  const answerImageId = currentQuestion.choiceImageIds[i];
                  const answerImage = currentQuestion.choiceImages[i];
                  return <button key={`${currentQuestion.id}-${i}`} disabled={eliminated} className={`${answers[current] === i ? "selected" : ""} ${eliminated ? "eliminated" : ""}`} onClick={() => choose(i)}>
                    <span>{String.fromCharCode(65 + i)}</span>
                    <b>{choice}{answerImageId && answerImage && <img className="choice-image" src={proxiedImageUrl("answer", answerImageId, answerImage)} alt={`รูปประกอบตัวเลือก ${String.fromCharCode(65 + i)}`} loading="lazy" referrerPolicy="no-referrer" />}</b>
                    <i>{eliminated ? "ตัดออก" : answers[current] === i ? "✓" : ""}</i>
                  </button>;
                })}</div>
              </article>
              {backendMessage && <p className="system-note" role="status">{backendMessage}</p>}
              <div className="exam-footer"><button className="secondary" disabled={current === 0} onClick={() => goTo(current - 1)}>ย้อนกลับ</button><button className="skip" onClick={() => { void syncQuestionLog(current, "skip", "skipped"); setStates((p) => ({ ...p, [current]: "paused" })); if (current < questions.length - 1) goTo(current + 1); }}>ข้ามข้อนี้</button>{current < questions.length - 1 ? <button className="primary" onClick={() => goTo(current + 1)}>ข้อถัดไป →</button> : <button className="primary" disabled={submitting} onClick={() => void handleSubmit()}>{submitting ? "กำลังตรวจคะแนน…" : "ส่งข้อสอบ"}</button>}</div>
            </section>
          </div>
        </div>}

        <nav className="mobile-nav" aria-label="เมนูบนมือถือ"><button className={view === "dashboard" ? "active" : ""} onClick={() => requestNavigation("dashboard")}><Glyph>⌂</Glyph><span>ภาพรวม</span></button><button className={view === "history" ? "active" : ""} onClick={() => requestNavigation("history")}><Glyph>◷</Glyph><span>ประวัติ</span></button><button className={view === "exam" ? "active" : ""} onClick={() => void requestStartExam()}><Glyph>✓</Glyph><span>ข้อสอบ</span></button></nav>
      </section>

      {startOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="start-title"><div className="modal wide"><span className="modal-icon start">→</span><h2 id="start-title">พร้อมเริ่มทำข้อสอบหรือยัง?</h2><p>เมื่อยืนยัน ระบบจะสร้างรอบทำข้อสอบใหม่และเริ่มนับเวลาทันที</p><div className="resume-summary detailed">
        <span><small>ชุดข้อสอบ</small><b>{selectedTest.title}</b></span>
        <span><small>วิชา / หมวด</small><b>{selectedTest.subject} · ชุดที่ {selectedTest.category}</b></span>
        <span><small>จำนวนข้อ</small><b>{selectedTest.question_count} ข้อ</b></span>
        <span><small>เวลาแนะนำ</small><b>{formatDurationLong(selectedTest.duration)}</b></span>
      </div><button className="primary full" onClick={() => void confirmStartExam()}>ยืนยัน เริ่มทำข้อสอบ</button><button className="danger-link neutral" onClick={() => setStartOpen(false)}>กลับไปเลือกชุดข้อสอบ</button></div></div>}
      {replaceOpen && pendingTest && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="replace-title"><div className="modal wide"><span className="modal-icon warning">!</span><h2 id="replace-title">เริ่มแบบทดสอบใหม่?</h2><p>หากเริ่ม <b>{pendingTest.title}</b> ระบบจะยกเลิกแบบทดสอบเดิมที่ค้างอยู่ทั้งหมด และสร้าง Test session ใหม่ทันที</p><div className="resume-summary detailed">
        <span><small>แบบทดสอบเดิม</small><b>{activeTestTitle}</b></span>
        <span><small>วิชา / หมวด</small><b>{selectedTest.subject} · ชุดที่ {selectedTest.category}</b></span>
        <span><small>ทำไปแล้ว</small><b>{answeredCount}/{questions.length || selectedTest.question_count} ข้อ</b></span>
        <span><small>เวลาทำจริง</small><b>{formatDurationLong(seconds)}</b></span>
        <span><small>ข้อที่เคยเปิดดู</small><b>{touchedQuestions} ข้อ</b></span>
        <span><small>เวลาเฉลี่ย</small><b>{formatPace(averageActiveQuestionSeconds)}</b></span>
      </div><button className="primary full" onClick={() => void confirmReplaceAttempt()}>ยืนยัน เริ่มชุดใหม่และยกเลิกชุดเก่า</button><button className="danger-link neutral" onClick={() => { setPendingTest(null); setReplaceOpen(false); }}>กลับไปทำชุดเดิม</button></div></div>}
      {leaveOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="leave-title"><div className="modal wide"><span className="modal-icon warning">!</span><h2 id="leave-title">กำลังทำข้อสอบอยู่</h2><p>หากออกจากหน้านี้ ต้องเลือกว่าจะกลับไปทำต่อ หรือยกเลิกแบบทดสอบนี้ก่อน</p><div className="resume-summary detailed"><span><small>ชุดข้อสอบ</small><b>{activeTestTitle}</b></span><span><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></span><span><small>เวลาที่ทำจริง</small><b>{formatDurationLong(seconds)}</b></span><span><small>เวลาต่อข้อเฉลี่ย</small><b>{formatPace(averageActiveQuestionSeconds)}</b></span></div><button className="primary full" onClick={() => { setLeaveOpen(false); setNavigationTarget(null); }}>ทำข้อสอบต่อ</button><button className="danger-link" onClick={() => { setLeaveOpen(false); setCancelOpen(true); }}>ยกเลิกแบบทดสอบ</button></div></div>}
      {resumeOpen && !cancelOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="resume-title"><div className="modal wide pause-modal"><span className="modal-icon">Ⅱ</span><h2 id="resume-title">พักการทำข้อสอบแล้ว</h2><p>คำตอบและเวลาที่ทำจริงถูกบันทึกไว้แล้ว ช่วงเวลาพักจะไม่ถูกนำไปคิดในผลการฝึก</p><div className="pause-duration"><small>พักมาแล้ว</small><b>{formatDurationLong(pauseSeconds)}</b><span>เริ่มพักใหม่ทุกครั้งที่กดพักข้อสอบ</span></div><div className="resume-summary detailed"><span><small>ชุดข้อสอบ</small><b>{activeTestTitle}</b></span><span><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></span><span><small>เวลาที่ทำจริง</small><b>{formatDurationLong(seconds)}</b></span><span><small>เวลาต่อข้อเฉลี่ย</small><b>{formatPace(averageActiveQuestionSeconds)}</b></span></div><button className="primary full" onClick={resumeExam}>ทำข้อสอบต่อ</button><button className="danger-link" onClick={() => { setNavigationTarget("dashboard"); setCancelOpen(true); }}>ยกเลิกแบบทดสอบ</button></div></div>}
      {cancelOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancel-title"><div className="modal wide"><span className="modal-icon warning">!</span><h2 id="cancel-title">ยกเลิกแบบทดสอบนี้?</h2><p>คำตอบและ Log ของรอบนี้จะไม่ถูกนำไปเป็นผลสอบหรือประวัติการฝึก และจะเริ่มต่อจากจุดเดิมไม่ได้</p><div className="resume-summary detailed"><span><small>ชุดข้อสอบ</small><b>{activeTestTitle}</b></span><span><small>ทำไปแล้ว</small><b>{answeredCount}/{questions.length} ข้อ</b></span><span><small>เวลาที่ทำจริง</small><b>{formatDurationLong(seconds)}</b></span><span><small>ข้อที่เคยเปิดดู</small><b>{touchedQuestions} ข้อ</b></span></div><button className="danger-button full" disabled={cancelling} onClick={() => void cancelAttempt()}>{cancelling ? "กำลังยกเลิก…" : "ยืนยัน ยกเลิกแบบทดสอบ"}</button><button className="danger-link neutral" disabled={cancelling} onClick={() => { setCancelOpen(false); if (!resumeOpen) setLeaveOpen(true); }}>กลับไปทำข้อสอบต่อ</button></div></div>}
      {submitOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-title"><div className="modal"><span className="modal-icon warning">!</span><h2 id="submit-title">ยังเหลือ {remaining} ข้อ</h2><p>ตรวจคำตอบให้ครบก่อนส่ง เพื่อให้ระบบวิเคราะห์ผลได้แม่นยำ</p><div className="missing-list">{questions.map((_, i) => answers[i] === undefined && <button key={i} onClick={() => { setSubmitOpen(false); goTo(i); }}>ข้อ {i + 1}</button>)}</div><button className="primary full" onClick={() => { setSubmitOpen(false); const n = questions.findIndex((_, i) => answers[i] === undefined); if (n >= 0) goTo(n); }}>ไปข้อที่ยังไม่ตอบ</button><button className="danger-link neutral" onClick={() => setSubmitOpen(false)}>กลับไปตรวจคำตอบ</button></div></div>}
      {result && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title"><div className="modal"><span className="modal-icon result">✓</span><h2 id="result-title">ตรวจคะแนนเรียบร้อย</h2><p>คุณตอบถูก <b>{result.correct_count} จาก {result.total_questions} ข้อ</b> คะแนนหลังหัก Hint <b>{Number(result.score).toFixed(1)}</b></p><div className="resume-summary"><span><small>Hint ที่ใช้</small><b>{result.hint_count} ครั้ง (-{Number(result.hint_penalty).toFixed(1)})</b></span><span><small>ความแม่นยำ</small><b>{Math.round(Number(result.accuracy))}%</b></span></div><button className="primary full" onClick={() => { setResult(null); setView("dashboard"); }}>กลับไปดูพัฒนาการ</button></div></div>}
    </main>
  );
}
