"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import {
  ensureAnonymousSession,
  loadAttemptDetail,
  loadDashboardSummary,
  loadLearningInsights,
  loadRemoteTest,
  logQuestionActivity,
  loadRemoteAttempts,
  loadRemoteTests,
  requestRemoteHint,
  cancelRemoteTest,
  cancelRemoteTestOnPageExit,
  heartbeatRemoteTest,
  pauseRemoteTest,
  startRemoteTest,
  submitRemoteAttempt,
  type AttemptResult,
  type ActiveTestLock,
  type AttemptDetail,
  type AttemptQuestionDetail,
  type DashboardSummary,
  type HintResult,
  type LearningInsights,
  type QuestionLogEvent,
  type QuestionLogStatus,
  type RemoteAttempt,
  type RemoteTest,
  type RemoteTestPayload,
  type RichTextContent,
} from "@/lib/supabase";

type View = "dashboard" | "history" | "exam";
type QuestionState = "viewed" | "paused" | "answered" | "changed_answer" | "reviewed";
type ExamQuestion = {
  id: string;
  q: string;
  content: RichTextContent | null;
  choices: string[];
  choiceContents: (RichTextContent | null)[];
  choiceIndexes: number[];
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
  priority: 999,
  level: "ระดับพื้นฐาน",
  duration: 1800,
  question_count: 10,
};
const fallbackQuestions: ExamQuestion[] = [
  { id: "20000000-0000-4000-8000-000000000001", q: "ถ้า 3x + 7 = 22 แล้ว x มีค่าเท่าใด?", content: null, choices: ["3", "5", "7", "9"], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "พีชคณิต", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000002", q: "จำนวนใดเป็นจำนวนเฉพาะ?", content: null, choices: ["21", "27", "29", "33"], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "จำนวน", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000003", q: "พื้นที่ของสี่เหลี่ยมจัตุรัสด้านยาว 8 ซม. เท่ากับเท่าใด?", content: null, choices: ["16 ตร.ซม.", "32 ตร.ซม.", "64 ตร.ซม.", "80 ตร.ซม."], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "เรขาคณิต", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000004", q: "3/4 เขียนเป็นทศนิยมได้ข้อใด?", content: null, choices: ["0.25", "0.50", "0.75", "1.25"], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "เศษส่วน", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000005", q: "ค่าเฉลี่ยของ 6, 8 และ 10 เท่ากับเท่าใด?", content: null, choices: ["7", "8", "9", "10"], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "สถิติ", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000006", q: "มุมตรงมีขนาดกี่องศา?", content: null, choices: ["45°", "90°", "180°", "360°"], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "เรขาคณิต", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000007", q: "2⁵ มีค่าเท่าใด?", content: null, choices: ["10", "16", "25", "32"], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "เลขยกกำลัง", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000008", q: "จำนวนถัดไปของ 2, 4, 8, 16 คือข้อใด?", content: null, choices: ["18", "24", "30", "32"], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "ลำดับ", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000009", q: "รากที่สองของ 144 คือข้อใด?", content: null, choices: ["10", "11", "12", "14"], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "รากที่สอง", level: "ระดับพื้นฐาน", image: null },
  { id: "20000000-0000-4000-8000-000000000010", q: "15% ของ 200 เท่ากับเท่าใด?", content: null, choices: ["15", "20", "30", "45"], choiceContents: [null, null, null, null], choiceIndexes: [0, 1, 2, 3], choiceImageIds: [null, null, null, null], choiceImages: [null, null, null, null], subject: "คณิตศาสตร์", category: "ร้อยละ", level: "ระดับพื้นฐาน", image: null },
];

const defaultAnswers: Record<number, number> = {};
const defaultStates: Record<number, QuestionState> = {};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_LEVEL_ORDER = ["basic", "normal", "intermediate", "advanced", "expert", "master"] as const;

function createBrowserUuid() {
  if (typeof window === "undefined") return "";
  return crypto.randomUUID();
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

function readLegacySessionId() {
  if (typeof window === "undefined") return "";
  try {
    return (JSON.parse(localStorage.getItem("skillquest-attempt") ?? "{}") as { sessionId?: string }).sessionId ?? "";
  } catch {
    return "";
  }
}

function categoryLevelRank(category: string) {
  const normalized = category.toLowerCase();
  const rank = CATEGORY_LEVEL_ORDER.findIndex((level) => normalized.includes(level));
  return rank === -1 ? CATEGORY_LEVEL_ORDER.length : rank;
}

function compareCategoryOptions(a: RemoteTest, b: RemoteTest) {
  const priorityA = Number.isFinite(Number(a.priority)) ? Number(a.priority) : Number.POSITIVE_INFINITY;
  const priorityB = Number.isFinite(Number(b.priority)) ? Number(b.priority) : Number.POSITIVE_INFINITY;
  if (priorityA !== priorityB) return priorityA - priorityB;

  const rankDiff = categoryLevelRank(a.category) - categoryLevelRank(b.category);
  if (rankDiff !== 0) return rankDiff;

  const numberA = Number((a.category.match(/\d+(?:\.\d+)?/) ?? [Number.POSITIVE_INFINITY])[0]);
  const numberB = Number((b.category.match(/\d+(?:\.\d+)?/) ?? [Number.POSITIVE_INFINITY])[0]);
  if (numberA !== numberB) return numberA - numberB;

  return a.category.localeCompare(b.category, "th");
}

function formatLevelName(category: string) {
  const normalized = category.toLowerCase().trim();
  const matched = CATEGORY_LEVEL_ORDER.find((level) => normalized === level);
  if (!matched) return category;
  return matched[0].toUpperCase() + matched.slice(1);
}

function formatTestTitle(test: Pick<RemoteTest, "subject" | "category" | "title">) {
  return `${test.subject} · ระดับ ${formatLevelName(test.category)}`;
}

function formatSubjectLevel(subject: string, category: string) {
  return `${subject} · ระดับ ${formatLevelName(category)}`;
}

function nextLevelName(category: string) {
  const rank = categoryLevelRank(category);
  const next = CATEGORY_LEVEL_ORDER[rank + 1];
  return next ? next[0].toUpperCase() + next.slice(1) : "";
}

function levelReadinessText(accuracy: number, avgSeconds: number, category: string) {
  const next = nextLevelName(category);
  if (accuracy >= 80 && avgSeconds > 0 && avgSeconds <= 75 && next) return `พร้อมลองระดับ ${next}`;
  if (accuracy >= 70 && avgSeconds <= 100) return "พื้นฐานระดับนี้เริ่มนิ่งแล้ว";
  if (accuracy < 60) return "ควรซ่อมความแม่นยำก่อนขยับระดับ";
  if (avgSeconds > 120) return "ทำได้ แต่ยังควรลดเวลาในระดับนี้";
  return "ฝึกซ้ำอีกเล็กน้อยเพื่อยืนยันความนิ่ง";
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

function safeDirectImageUrl(rawUrl: string | null | undefined) {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, "https://");
  return trimmed;
}

function isImageSourceLink(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return false;
  try {
    const url = new URL(raw);
    return /\.(?:apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function proxiedImageUrl(kind: "question" | "answer", id: string, rawUrl: string | null | undefined) {
  if (!rawUrl) return "";
  if (!isExternalImage(rawUrl)) return rawUrl.trim();
  return safeDirectImageUrl(rawUrl);
}

function handleImageFallback(rawUrl: string | null | undefined) {
  return (event: SyntheticEvent<HTMLImageElement>) => {
    const fallback = safeDirectImageUrl(rawUrl);
    if (fallback && event.currentTarget.src !== fallback) {
      event.currentTarget.src = fallback;
    }
  };
}

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

type HistoryRow = {
  id: string;
  date: string;
  dateKey: string;
  subject: string;
  set: string;
  score: string;
  accuracy: string;
  time: string;
  status: string;
};

type CalendarDay = {
  key: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  rows: HistoryRow[];
};

function HistoryTable({ rows, onOpenDetail }: { rows: HistoryRow[]; onOpenDetail: (attemptId: string) => void }) {
  if (!rows.length) {
    return <div className="table-empty history-empty">ยังไม่มีประวัติที่ส่งสำเร็จ เมื่อทำข้อสอบครบและกดส่ง ระบบจะแสดงผลล่าสุดไว้ที่นี่อัตโนมัติ</div>;
  }
  return <div className="history-table">
    <div className="history-head"><span>วันที่</span><span>ระดับข้อสอบ</span><span>คะแนน</span><span>ความแม่นยำ</span><span>เวลาที่ใช้</span><span>Insight</span></div>
    {rows.map((h) => <div className="history-row" key={h.id}>
      <span>{h.date}</span><span><b>{h.subject}</b><small>{h.set}</small></span><span>{h.score}</span><span>{h.accuracy}</span><span>{h.time}</span><span><button className="row-action" onClick={() => onOpenDetail(h.id)}>ดู Insight</button></span>
    </div>)}
  </div>;
}

function RichContentView({ content, fallback, variant }: { content?: RichTextContent | null; fallback: string; variant: "question" | "choice" }) {
  if (variant === "question") {
    return <div className="question-prompt plain"><p>{fallback}</p></div>;
  }

  const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
  if (!blocks.length) {
    return <span className="choice-content">{fallback}</span>;
  }

  const rendered = blocks.map((block, index) => {
    if (block.type === "ordered_list") {
      const items = Array.isArray(block.items) ? block.items.filter((item) => item.text?.trim()) : [];
      if (!items.length) return null;
      return <ol key={`list-${index}`}>
        {items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}><span>{itemIndex + 1}</span><p>{item.text}</p></li>)}
      </ol>;
    }
    const text = block.text?.trim();
    if (!text) return null;
    return <p key={`p-${index}`}>{text}</p>;
  });

  return <div className="choice-content rich-choice">{rendered}</div>;
}

function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatCalendarTitle(date: Date) {
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(date);
}

function formatFullThaiDate(dateKey: string) {
  return new Intl.DateTimeFormat("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${dateKey}T00:00:00`));
}

function buildAttemptCalendar(rows: HistoryRow[], anchor = new Date()): CalendarDay[] {
  const grouped = rows.reduce<Record<string, HistoryRow[]>>((acc, row) => {
    acc[row.dateKey] = [...(acc[row.dateKey] ?? []), row];
    return acc;
  }, {});
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1 - startOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    return {
      key,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === anchor.getMonth(),
      isToday: key === localDateKey(new Date()),
      rows: grouped[key] ?? [],
    };
  });
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>(defaultAnswers);
  const [states, setStates] = useState<Record<number, QuestionState>>(defaultStates);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [pauseStartedAt, setPauseStartedAt] = useState("");
  const [pausedNow, setPausedNow] = useState(() => Date.now());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [calendarDayKey, setCalendarDayKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [clientNonce, setClientNonce] = useState("");
  const [clientInstanceId, setClientInstanceId] = useState("");
  const [backendStatus, setBackendStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [backendMessage, setBackendMessage] = useState("");
  const [remoteAttempts, setRemoteAttempts] = useState<RemoteAttempt[]>([]);
  const [testOptions, setTestOptions] = useState<RemoteTest[]>([]);
  const [selectedTest, setSelectedTest] = useState<RemoteTest>(fallbackTest);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [pendingTest, setPendingTest] = useState<RemoteTest | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [navigationTarget, setNavigationTarget] = useState<View | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [activeTestLock, setActiveTestLock] = useState<ActiveTestLock | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [loadedTestId, setLoadedTestId] = useState("");
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [learningInsights, setLearningInsights] = useState<LearningInsights | null>(null);
  const [attemptDetail, setAttemptDetail] = useState<AttemptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [selectedLogQuestion, setSelectedLogQuestion] = useState<AttemptQuestionDetail | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [questionSeconds, setQuestionSeconds] = useState<Record<number, number>>({});
  const [hints, setHints] = useState<Record<number, HintResult[]>>({});
  const [hinting, setHinting] = useState(false);
  const currentRef = useRef(current);
  const answersRef = useRef(answers);
  const statesRef = useRef(states);
  const questionSecondsRef = useRef(questionSeconds);
  const questionsRef = useRef(questions);
  const selectedTestRef = useRef(selectedTest);
  const activeSessionIdRef = useRef(activeSessionId);
  const clientNonceRef = useRef("");
  const clientInstanceIdRef = useRef("");

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
  const activeTestTitle = formatTestTitle(selectedTest);
  const examReady = Boolean(selectedCategoryId) && !loadingQuestions;
  const activeSubject = selectedTest.subject;
  const subjectOptions = Array.from(new Set((testOptions.length ? testOptions : [fallbackTest]).map((test) => test.subject)));
  const categoryOptions = (testOptions.length ? testOptions : [fallbackTest])
    .filter((test) => test.subject === activeSubject)
    .slice()
    .sort(compareCategoryOptions);
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
      content: question.question_content ?? null,
      choices: question.choices
        .map((choice) => choice.answer),
      choiceContents: question.choices
        .map((choice) => choice.answer_content ?? null),
      choiceIndexes: question.choices
        .map((choice) => choice.choice_index),
      choiceImageIds: question.choices
        .map((choice) => choice.answer_id),
      choiceImages: question.choices
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
      setBackendMessage("โหลดระดับข้อสอบจากฐานข้อมูลไม่สำเร็จ กำลังใช้ข้อสอบตัวอย่างในเครื่อง");
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
    const nextTest = (testOptions.length ? testOptions : [fallbackTest])
      .filter((test) => test.subject === subject)
      .slice()
      .sort(compareCategoryOptions)[0];
    if (nextTest) chooseTestOption(nextTest.test_id);
  }

  useEffect(() => {
    void (async () => {
      try {
        const legacySessionId = readLegacySessionId();
        await ensureAnonymousSession("ผู้ใช้งานหลัก");
        // Attempt recovery was deliberately removed: a refresh/close ends a test.
        // Cancel a session created by older versions once the authenticated client is ready.
        localStorage.removeItem("skillquest-attempt");
        localStorage.removeItem("skillquest-attempt-nonce");
        if (legacySessionId) await cancelRemoteTest(legacySessionId).catch(() => undefined);
        const [attemptRows, testRows, summary, insights] = await Promise.all([loadRemoteAttempts(), loadRemoteTests(), loadDashboardSummary(), loadLearningInsights()]);
        setRemoteAttempts(attemptRows);
        setDashboardSummary(summary);
        setLearningInsights(insights);
        setTestOptions(testRows);
        const nextTest = testRows.slice().sort((a, b) => a.subject.localeCompare(b.subject, "th") || compareCategoryOptions(a, b))[0];
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
    // Generate browser-only identifiers after hydration. A refresh becomes a
    // new page instance, which intentionally cannot resume an old test.
    if (!clientNonceRef.current) {
      const nonce = createBrowserUuid();
      clientNonceRef.current = nonce;
      setClientNonce(nonce);
    }
    if (!clientInstanceIdRef.current) {
      const instanceId = createBrowserUuid();
      clientInstanceIdRef.current = instanceId;
      setClientInstanceId(instanceId);
    }
  }, []);

  useEffect(() => {
    currentRef.current = current;
    answersRef.current = answers;
    statesRef.current = states;
    questionSecondsRef.current = questionSeconds;
    questionsRef.current = questions;
    selectedTestRef.current = selectedTest;
    activeSessionIdRef.current = activeSessionId;
    if (clientNonce) clientNonceRef.current = clientNonce;
  }, [activeSessionId, answers, clientNonce, current, questionSeconds, questions, selectedTest, states]);

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
    if (!running || backendStatus !== "online" || !clientNonceRef.current) return;
    const heartbeat = window.setInterval(() => {
      void syncQuestionLog(currentRef.current, "heartbeat");
    }, 8000);
    return () => window.clearInterval(heartbeat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendStatus, running]);

  useEffect(() => {
    const sessionId = activeSessionId;
    if (!sessionId || backendStatus !== "online" || !clientInstanceId) return;
    let disposed = false;
    const sendHeartbeat = async () => {
      try {
        const heartbeat = await heartbeatRemoteTest(sessionId, clientInstanceId);
        if (heartbeat.active === false || heartbeat.status === "cancelled") {
          resetAttemptState();
          setView("dashboard");
          setBackendMessage("รอบทำข้อสอบนี้สิ้นสุดแล้ว จึงไม่สามารถทำต่อได้");
        }
      } catch (error) {
        if (disposed) return;
        if (error instanceof Error && error.message === "TEST_NOT_ACTIVE") {
          resetAttemptState();
          setView("dashboard");
          setBackendMessage("รอบทำข้อสอบนี้สิ้นสุดแล้ว จึงไม่สามารถทำต่อได้");
        }
      }
    };
    void sendHeartbeat();
    const heartbeat = window.setInterval(() => void sendHeartbeat(), 30_000);
    return () => { disposed = true; window.clearInterval(heartbeat); };
    // The instance ID is intentionally page-lifetime only: a refresh starts a new page and ends its old test.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, backendStatus, clientInstanceId]);

  useEffect(() => {
    const cancelOnPageExit = () => {
      const sessionId = activeSessionIdRef.current;
      localStorage.removeItem("skillquest-attempt");
      localStorage.removeItem("skillquest-attempt-nonce");
      if (sessionId) cancelRemoteTestOnPageExit(sessionId);
    };
    window.addEventListener("pagehide", cancelOnPageExit);
    return () => window.removeEventListener("pagehide", cancelOnPageExit);
  }, []);

  useEffect(() => {
    const showTimer = window.setTimeout(() => setSaved(true), 0);
    const hideTimer = window.setTimeout(() => setSaved(false), 900);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [activeSessionId, answers, states, current, seconds, questionSeconds, hints, running]);

  const averageAccuracy = dashboardSummary ? Math.round(Number(dashboardSummary.average_accuracy)) : remoteAttempts.length ? Math.round(remoteAttempts.reduce((sum, item) => sum + Number(item.accuracy), 0) / remoteAttempts.length) : 82;
  const totalSeconds = dashboardSummary ? Number(dashboardSummary.active_seconds ?? 0) : remoteAttempts.reduce((sum, item) => sum + item.elapsed_seconds, 0);
  const syncedAttemptsCount = dashboardSummary ? Number(dashboardSummary.attempts_count ?? 0) : remoteAttempts.length;
  const subjectMastery = dashboardSummary?.subjects?.length
    ? dashboardSummary.subjects.map((item, index) => ({
      name: item.subject,
      mastery: Math.max(0, Math.min(100, Math.round(Number(item.accuracy) || 0))),
      delta: `${Number(item.attempts) || 0} รอบ`,
      color: ["blue", "purple", "cyan", "green", "orange"][index % 5],
    }))
    : subjects;
  const remoteHistory = remoteAttempts
    .slice()
    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())
    .map((item) => ({
    id: item.id,
    date: new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(item.submitted_at)),
    dateKey: localDateKey(new Date(item.submitted_at)),
    subject: item.Test?.Subject ?? "แบบทดสอบ",
    set: item.Test?.Question ? item.Test.Question.replace("ชุดที่ ", "ระดับ ") : "ระดับฝึก",
    score: `${item.correct_count}/${item.total_questions}`,
    accuracy: `${Math.round(Number(item.accuracy))}%`,
    time: formatDurationLong(item.elapsed_seconds),
    status: "สำเร็จ",
  }));
  const calendarAnchor = new Date();
  const calendarDays = useMemo(() => buildAttemptCalendar(remoteHistory, calendarAnchor), [remoteHistory]);
  const selectedCalendarRows = calendarDayKey ? remoteHistory.filter((row) => row.dateKey === calendarDayKey) : [];
  const currentMonthAttemptCount = calendarDays
    .filter((day) => day.isCurrentMonth)
    .reduce((sum, day) => sum + day.rows.length, 0);
  const todayAttemptCount = calendarDays.find((day) => day.isToday)?.rows.length ?? 0;
  const insightOverview = learningInsights?.overview;
  const hasInsightData = Boolean(insightOverview && insightOverview.questions_seen > 0);
  const subjectTimeRows = learningInsights?.subjects ?? [];
  const categoryInsightRows = (learningInsights?.categories ?? []).slice(0, 8);
  const sortedLevelInsightRows = (learningInsights?.categories ?? []).slice().sort((a, b) => categoryLevelRank(a.category) - categoryLevelRank(b.category));
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
  const currentLevelInsight = sortedLevelInsightRows.find((item) => item.subject === activeSubject && formatLevelName(item.category) === formatLevelName(selectedTest.category))
    ?? sortedLevelInsightRows.find((item) => item.subject === activeSubject)
    ?? sortedLevelInsightRows[0];
  const focusLevelInsight = sortedLevelInsightRows.find((item) => Number(item.wrong_count) > 0)
    ?? sortedLevelInsightRows.find((item) => Number(item.avg_seconds) > speedTarget)
    ?? currentLevelInsight;
  const focusLevelLabel = focusLevelInsight ? formatSubjectLevel(focusLevelInsight.subject, focusLevelInsight.category) : "รอผลสอบระดับแรก";
  const readinessLabel = currentLevelInsight
    ? levelReadinessText(clampPercent(Number(currentLevelInsight.accuracy)), Number(currentLevelInsight.avg_seconds) || 0, currentLevelInsight.category)
    : "ทำข้อสอบให้จบอย่างน้อย 1 รอบเพื่อประเมินระดับ";

  const detailQuestions = attemptDetail?.questions ?? [];
  const detailSlowest = detailQuestions.reduce<AttemptQuestionDetail | null>((slowest, item) => (
    !slowest || item.duration_seconds > slowest.duration_seconds ? item : slowest
  ), null);
  const detailWrongQuestions = detailQuestions.filter((item) => item.status === "incorrect");
  const detailCorrectQuestions = detailQuestions.filter((item) => item.status === "correct");

  function questionResultLabel(status: string) {
    if (status === "correct") return "ถูก";
    if (status === "incorrect") return "ผิด";
    if (status === "skipped") return "ข้าม";
    return "บันทึกแล้ว";
  }

  function questionInsightText(item: AttemptQuestionDetail) {
    if (item.status === "incorrect" && item.duration_seconds >= 90) return "ใช้เวลานานแล้วยังผิด ควรทบทวนวิธีคิดทีละขั้น";
    if (item.status === "incorrect") return "ตอบผิด ควรดูเฉลยและลองทำซ้ำโดยไม่ดูคำตอบ";
    if (item.duration_seconds >= 120) return "ตอบถูกแต่ใช้เวลานาน ลองหาวิธีลัดหรือฝึกจับ pattern";
    if (item.used_hint) return "ทำถูก/บันทึกแล้วแต่ใช้ Hint ควรลองทำซ้ำแบบไม่ใช้ตัวช่วย";
    return "จังหวะดี เก็บไว้เป็นข้อที่ทำได้มั่นใจ";
  }

  async function openAttemptDetail(attemptId: string) {
    if (backendStatus !== "online") {
      setBackendMessage("ต้องเชื่อมต่อ Supabase ก่อนจึงจะดู Insight รายรอบได้");
      return;
    }
    setDetailLoading(true);
    setDetailError("");
    setSelectedLogQuestion(null);
    try {
      const detail = await loadAttemptDetail(attemptId);
      setAttemptDetail(detail);
    } catch (error) {
      setAttemptDetail(null);
      setDetailError(error instanceof Error && error.message === "ATTEMPT_NOT_FOUND"
        ? "ไม่พบผลสอบรอบนี้แล้ว"
        : "โหลด Insight รอบนี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setDetailLoading(false);
    }
  }

  function statusFor(index: number): QuestionLogStatus {
    if (answersRef.current[index] !== undefined) return statesRef.current[index] === "changed_answer" ? "changed_answer" : "answered";
    if (statesRef.current[index] === "paused") return "skipped";
    return "viewed";
  }

  function ensureClientNonce(forcedNonce?: string) {
    const nextNonce = isUuid(forcedNonce) ? forcedNonce : isUuid(clientNonceRef.current) ? clientNonceRef.current : createBrowserUuid();
    clientNonceRef.current = nextNonce;
    setClientNonce(nextNonce);
    return nextNonce;
  }

  function ensureClientInstance() {
    const instanceId = isUuid(clientInstanceIdRef.current) ? clientInstanceIdRef.current : createBrowserUuid();
    clientInstanceIdRef.current = instanceId;
    setClientInstanceId(instanceId);
    return instanceId;
  }

  async function syncQuestionLog(index: number, eventType: QuestionLogEvent, status?: QuestionLogStatus, quiet = true) {
    const activeQuestions = questionsRef.current;
    const sessionId = activeSessionIdRef.current;
    const nonce = clientNonceRef.current;
    if (backendStatus !== "online" || !isUuid(nonce) || !activeQuestions[index] || !sessionId) return;
    try {
      await logQuestionActivity({
        set_id: sessionId,
        question_id: activeQuestions[index].id,
        client_nonce: nonce,
        event_type: eventType,
        duration_seconds: questionSecondsRef.current[index] ?? 0,
        selected_choice: answersRef.current[index] !== undefined ? activeQuestions[index].choiceIndexes[answersRef.current[index]] ?? null : null,
        status: status ?? statusFor(index),
      });
    } catch {
      if (!quiet) setBackendMessage("บันทึก Log รายข้อยังไม่สำเร็จ ระบบจะลองใหม่เมื่อมีการทำรายการถัดไป");
    }
  }

  async function syncAllQuestionLogs(eventType: QuestionLogEvent) {
    if (backendStatus !== "online" || !isUuid(clientNonceRef.current)) return;
    await Promise.all(questions.map((_, index) => syncQuestionLog(index, eventType, index === currentRef.current ? "submitted" : statusFor(index))));
  }

  async function startFreshExam(test: RemoteTest, nonce: string) {
    const categoryId = test.category_id || test.test_id;
    const nextNonce = ensureClientNonce(nonce);
    const instanceId = ensureClientInstance();
    if (!isUuid(categoryId)) {
      setBackendMessage("ข้อมูลระดับข้อสอบไม่ครบ กรุณาเลือกวิชาและระดับใหม่อีกครั้ง");
      return false;
    }
    try {
      const started = await startRemoteTest(categoryId, nextNonce, instanceId);
      if ("active_test" in started) {
        setActiveTestLock(started.active_test);
        return false;
      }
      setActiveSessionId(started.test_id);
      activeSessionIdRef.current = started.test_id;
      setSelectedTest(started);
      selectedTestRef.current = started;
      const ok = await loadExamTest(started.test_id);
      if (!ok && backendStatus === "online") {
        await cancelRemoteTest(started.test_id).catch(() => undefined);
        resetAttemptState(true);
        setBackendMessage("โหลดข้อสอบไม่สำเร็จ ระบบยกเลิกรอบนี้แล้ว ลองเริ่มใหม่ได้ทันที");
        return false;
      }
      setView("exam");
      setRunning(true);
      window.setTimeout(() => void syncQuestionLog(0, "enter", "viewed"), 0);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "INVALID_TEST") setBackendMessage("ระดับข้อสอบนี้เริ่มไม่ได้ กรุณาเลือกระดับอื่นหรือรีเฟรชรายการข้อสอบ");
      else if (message === "AUTH_REQUIRED" || message === "INVALID_SESSION") setBackendMessage("เซสชันหมดอายุ กรุณารีเฟรชหน้าเว็บหนึ่งครั้งแล้วเริ่มใหม่");
      else setBackendMessage("เริ่มทำข้อสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return false;
    }
  }

  function requestStartExam() {
    if (!examReady) {
      setBackendMessage("กำลังโหลดระดับข้อสอบ กรุณารอสักครู่");
      return;
    }
    const sessionId = activeSessionIdRef.current;
    if (sessionId) {
      setNavigationTarget("dashboard");
      if (running) void pauseExam(); else setResumeOpen(true);
      return;
    }
    setStartOpen(true);
  }

  async function confirmStartExam() {
    const nextNonce = ensureClientNonce(createBrowserUuid());
    setStarting(true);
    try {
      resetAttemptState(true, nextNonce);
      const started = await startFreshExam(selectedTestRef.current, nextNonce);
      if (started) setStartOpen(false);
    } finally {
      setStarting(false);
    }
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
    setNavigationTarget(null);
    setView("exam");
    setRunning(true);
    void syncQuestionLog(currentRef.current, "enter", statusFor(currentRef.current), false);
  }

  function requestNavigation(nextView: View) {
    if (nextView === view) return;
    if (view === "exam" && activeSessionIdRef.current) {
      setNavigationTarget(nextView);
      if (running) void pauseExam(); else setResumeOpen(true);
      return;
    }
    setView(nextView);
  }

  function openCatalog() {
    requestNavigation("dashboard");
  }

  async function cancelAttempt() {
    const destination = navigationTarget ?? "dashboard";
    setCancelling(true);
    try {
      const sessionId = activeSessionIdRef.current;
      if (sessionId && backendStatus !== "online") throw new Error("OFFLINE");
      if (sessionId) await cancelRemoteTest(sessionId);
      resetAttemptState();
      setRunning(false);
      setPauseStartedAt("");
      setResumeOpen(false);
      setCancelOpen(false);
      setNavigationTarget(null);
      setView(destination);
      setBackendMessage("");
    } catch (error) {
      // A page-exit heartbeat or another tab may have already cancelled this
      // session. Treat that response as the desired end state so the modal
      // cannot trap the user with a stale local attempt.
      if (error instanceof Error && error.message === "TEST_NOT_ACTIVE") {
        resetAttemptState();
        setRunning(false);
        setPauseStartedAt("");
        setResumeOpen(false);
        setCancelOpen(false);
        setNavigationTarget(null);
        setView(destination);
        setBackendMessage("แบบทดสอบนี้ถูกยกเลิกไปแล้ว");
        return;
      }
      setBackendMessage("ยกเลิกข้อสอบยังไม่สำเร็จ ระบบคงรอบเดิมไว้เพื่อไม่ให้ข้อมูลสูญหาย กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง");
    } finally {
      setCancelling(false);
    }
  }

  async function confirmReplaceAttempt() {
    if (!pendingTest) return;
    setRunning(false);
    if (activeSessionIdRef.current) await cancelRemoteTest(activeSessionIdRef.current);
    const nextTest = pendingTest;
    const nextNonce = ensureClientNonce(createBrowserUuid());
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
    const nextNonce = ensureClientNonce(forcedNonce);
    localStorage.removeItem("skillquest-attempt");
    localStorage.removeItem("skillquest-attempt-nonce");
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
    setResumeOpen(false);
    setRunning(false);
    if (clearResult) setResult(null);
  }
  async function handleHint() {
    const nonce = clientNonceRef.current;
    if (backendStatus !== "online" || !isUuid(nonce)) {
      setBackendMessage("Hint ต้องเชื่อมต่อฐานข้อมูลก่อน เพื่อจำกัดสิทธิ์ 2 ครั้งต่อรอบสอบ");
      return;
    }
    if (totalHintsUsed >= 2) {
      setBackendMessage("ใช้ Hint ครบ 2 ครั้งสำหรับรอบนี้แล้ว");
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
        client_nonce: nonce,
        duration_seconds: questionSecondsRef.current[current] ?? 0,
      });
      setHints((prev) => ({ ...prev, [current]: [...(prev[current] ?? []), hint] }));
      setBackendMessage("");
    } catch (error) {
      setBackendMessage(error instanceof Error && error.message === "HINT_LIMIT_REACHED"
        ? "ใช้ Hint ครบ 2 ครั้งสำหรับรอบนี้แล้ว"
        : "ขอ Hint ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setHinting(false);
    }
  }
  async function handleSubmit() {
    if (remaining > 0) { setSubmitOpen(true); return; }
    const nonce = clientNonceRef.current;
    if (backendStatus !== "online" || !isUuid(nonce)) {
      setBackendMessage("ยังส่งผลไม่ได้ในขณะออฟไลน์ คำตอบถูกเก็บไว้ในเครื่องแล้ว");
      return;
    }
    setSubmitting(true); setRunning(false);
    try {
      await syncAllQuestionLogs("submit");
      const keyedAnswers = Object.fromEntries(Object.entries(answers).map(([index, choice]) => {
        const question = questions[Number(index)];
        return [question.id, question.choiceIndexes[choice] ?? choice];
      }));
      const submitted = await submitRemoteAttempt({ set_id: activeTestId, answers: keyedAnswers, elapsed_seconds: Math.max(30, seconds), client_nonce: nonce });
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
          <button className={view === "exam" ? "active" : ""} onClick={openCatalog}><Glyph>✓</Glyph>คลังข้อสอบ</button>
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
            <div><p>ภาพรวมการฝึกส่วนตัว</p><h1>Dashboard สำหรับผู้เตรียมสอบคนเดียว</h1><span>สรุปจากผลที่ส่งสำเร็จและ Log รายข้อ เพื่อดูความแม่นยำ เวลา และระดับที่ควรทบทวน</span></div>
            <button className="primary" disabled={!examReady} onClick={() => void requestStartExam()}>{loadingQuestions ? "กำลังโหลดข้อสอบ" : "เริ่มทำข้อสอบ"} <span>→</span></button>
          </div>

          <section className="focus-band">
            <div className="focus-copy"><span className="focus-icon">↗</span><div><small>คลังข้อสอบจาก Supabase</small><h2>{activeTestTitle}</h2><p>{selectedTest.subject} · ระดับ {formatLevelName(selectedTest.category)} · {selectedTest.question_count || questions.length} ข้อ · เวลาฝึกแนะนำ {Math.round((selectedTest.duration || 0) / 60)} นาที</p></div></div>
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
                <span>เลือกระดับข้อสอบ</span>
                <select
                  value={selectedCategoryId}
                  disabled={loadingQuestions || categoryOptions.length === 0}
                  onChange={(event) => chooseTestOption(event.target.value)}
                  aria-label="เลือกระดับข้อสอบ"
                >
                  {categoryOptions.map((test) => <option key={test.test_id} value={test.test_id}>ระดับ {test.category} ({test.question_count} ข้อ)</option>)}
                </select>
              </label>
              <button disabled={!examReady} onClick={() => void requestStartExam()}>{loadingQuestions ? "กำลังโหลด…" : "เริ่มระดับนี้"}</button>
            </div>
          </section>

          <section className="metric-row" aria-label="สถิติสำคัญ">
            <article><span>ความแม่นยำเฉลี่ย</span><b>{averageAccuracy}%</b><small className="positive">คำนวณจากรอบที่ส่งสำเร็จ</small></article>
            <article><span>เวลาทำข้อสอบรวม</span><b>{formatDurationLong(totalSeconds)}</b><small>นับเฉพาะเวลาที่ Active ไม่รวมพัก</small></article>
            <article><span>ทำข้อสอบแล้ว</span><b>{syncedAttemptsCount || (backendStatus === "online" ? 0 : 24)} รอบ</b><small>{backendStatus === "online" ? "สรุปจาก Log และผลส่งสำเร็จ" : "กำลังใช้ข้อมูลตัวอย่าง"}</small></article>
            <article><span>ข้อที่มี Log</span><b>{Number(dashboardSummary?.answered_logs ?? 0).toLocaleString()}</b><small className="positive">ใช้วิเคราะห์จุดแข็ง/จุดอ่อน</small></article>
          </section>

          <section className="insight-board" aria-label="แดชบอร์ดวิเคราะห์การฝึก">
            <article className="panel insight-hero">
              <div className="section-heading"><div><h2>Training Insight</h2><p>วิเคราะห์ความพร้อมรายระดับจาก Log รายข้อ ไม่ดึงข้อสอบทั้งหมดขึ้นหน้าเว็บ</p></div><span className={`insight-state ${hasInsightData ? "ready" : ""}`}>{hasInsightData ? "พร้อมวิเคราะห์" : "รอข้อมูล"}</span></div>
              <div className="insight-metrics">
                <div><span>ความเร็วเฉลี่ย</span><b>{formatPace(averageQuestionSeconds)}</b><small>{insightPaceLabel}</small></div>
                <div><span>มัธยฐานความเร็ว</span><b>{formatPace(medianQuestionSeconds)}</b><small>กันข้อที่นานผิดปกติ</small></div>
                <div><span>ระดับที่ควรโฟกัส</span><b>{focusLevelInsight ? formatLevelName(focusLevelInsight.category) : "—"}</b><small>{focusLevelLabel}</small></div>
                <div><span>สถานะระดับปัจจุบัน</span><b>{currentLevelInsight ? `${clampPercent(Number(currentLevelInsight.accuracy))}%` : "—"}</b><small>{readinessLabel}</small></div>
              </div>
              {!hasInsightData && <div className="insight-empty"><b>ยังไม่มี Insight รายระดับ</b><span>เริ่มทำข้อสอบและกดส่งผล ระบบจะสะสมเวลา ความแม่นยำ และข้อผิดของแต่ละระดับให้อัตโนมัติ</span></div>}
              {hasInsightData && <div className="coach-list">
                {(insightRecommendations.length ? insightRecommendations : [{ title: "ภาพรวมยังปกติ", body: "ยังไม่พบระดับที่เสี่ยงเด่นชัด ให้ทำเพิ่มอีก 1–2 รอบเพื่อให้ Insight แม่นขึ้น", priority: "low", type: "speed" }]).map((item) => <div className={`coach-item ${item.priority}`} key={`${item.type}-${item.title}`}><span>{item.priority === "high" ? "!" : "i"}</span><div><b>{item.title}</b><small>{item.body.replaceAll("ชุดที่", "ระดับ")}</small></div></div>)}
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
              <div className="section-heading"><div><h2>วิเคราะห์ตามระดับข้อสอบ</h2><p>ดูว่าแต่ละระดับแม่นแค่ไหน ใช้เวลาเท่าไหร่ และพร้อมขยับระดับหรือยัง</p></div></div>
              <div className="diagnosis-table">
                <div className="diagnosis-head"><span>ระดับ</span><span>ความแม่น</span><span>เฉลี่ย/ข้อ</span><span>คำแนะนำ</span></div>
                {(categoryInsightRows.length ? categoryInsightRows : []).map((item) => {
                  const accuracy = clampPercent(Number(item.accuracy));
                  const avg = Number(item.avg_seconds) || 0;
                  const note = levelReadinessText(accuracy, avg, item.category);
                  return <div className="diagnosis-row" key={`${item.subject}-${item.category}`}>
                    <span><b>{formatSubjectLevel(item.subject, item.category)}</b><small>{item.questions_seen} ข้อ · ผิด {item.wrong_count} ข้อ</small></span>
                    <span>{item.scored_count ? `${accuracy}%` : "—"}</span>
                    <span>{formatPace(avg)}</span>
                    <span className={accuracy < 70 || avg > speedTarget ? "warn" : "ok"}>{note}</span>
                    <i style={{ width: `${Math.max(8, (avg / maxCategoryAvg) * 100)}%` }} />
                  </div>;
                })}
                {!categoryInsightRows.length && <div className="table-empty">ยังไม่มีระดับที่วิเคราะห์ได้ ลองทำข้อสอบให้จบอย่างน้อย 1 รอบ</div>}
              </div>
            </article>

            <article className="panel slow-question-card">
              <div className="section-heading"><div><h2>ข้อที่ควรกลับไปดู</h2><p>เรียงจากเวลานานและความเสี่ยงตอบผิด</p></div></div>
              <div className="watch-list">
                {slowQuestionRows.slice(0, 5).map((item, index) => <div className="watch-item" key={item.question_id}>
                  <span>{index + 1}</span>
                  <div><b>{formatSubjectLevel(item.subject, item.category)}</b><p>{item.question}</p><small>{formatDurationLong(Number(item.duration_seconds))} · {item.reason}</small></div>
                </div>)}
                {!slowQuestionRows.length && <div className="table-empty">ยังไม่มีข้อที่ใช้เวลานาน ระบบจะเริ่มจัด watchlist หลังมี Log รายข้อ</div>}
              </div>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel trend-card">
              <div className="section-heading"><div><h2>Calendar การฝึก</h2><p>ดูว่าวันไหนส่งแบบทดสอบสำเร็จกี่รอบ และกดวันที่มีข้อมูลเพื่อดูรายละเอียด</p></div><span className="calendar-month">{formatCalendarTitle(calendarAnchor)}</span></div>
              <div className="calendar-summary" aria-label="สรุปจำนวนรอบสอบจากปฏิทิน">
                <span><b>{currentMonthAttemptCount}</b><small>รอบในเดือนนี้</small></span>
                <span><b>{todayAttemptCount}</b><small>รอบวันนี้</small></span>
              </div>
              <div className="attempt-calendar" aria-label="ปฏิทินการทำแบบทดสอบ">
                {["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}
                {calendarDays.map((day) => {
                  const count = day.rows.length;
                  return <button
                    key={day.key}
                    type="button"
                    className={`calendar-day ${day.isCurrentMonth ? "" : "muted"} ${day.isToday ? "today-cell" : ""} ${count ? "has-attempt" : ""}`}
                    onClick={() => count && setCalendarDayKey(day.key)}
                    disabled={!count}
                    aria-label={`${formatFullThaiDate(day.key)} ${count ? `มีแบบทดสอบ ${count} รอบ` : "ไม่มีแบบทดสอบ"}`}
                  >
                    <span>{day.day}</span>
                    {count > 0 && <b>{count} รอบ</b>}
                  </button>;
                })}
              </div>
            </article>
            <article className="panel next-card"><div className="section-heading"><div><h2>เป้าหมายถัดไป</h2><p>โฟกัสจากผลล่าสุด</p></div><span className="level-badge">Personal</span></div><div className="ring"><b>{averageAccuracy || 0}%</b><span>Accuracy</span></div><p>เป้าหมายที่เหมาะตอนนี้คือทำให้จบอย่างน้อย 1 รอบในระดับที่เลือก แล้วดูว่าควรซ่อมระดับเดิมหรือพร้อมขยับระดับถัดไป</p><div className="next-checks"><span className="done">✓ เก็บเวลาแยกรายข้อ</span><span>○ ส่งข้อสอบให้ครบทุกข้อ</span><span>○ ทบทวนระดับที่ช้ากว่าเป้า</span></div></article>
          </section>

          <section className="panel mastery-card">
            <div className="section-heading"><div><h2>ความชำนาญรายวิชา</h2><p>เทียบกับผลการฝึก 30 วันที่ผ่านมา</p></div><button className="text-button">ดูรายละเอียด</button></div>
            <div className="subject-list">{subjectMastery.map((s) => <div className="subject-row" key={s.name}><div><b>{s.name}</b><small className="positive">{s.delta}</small></div><div className="progress"><i className={s.color} style={{ width: `${s.mastery}%` }} /></div><strong>{s.mastery}%</strong></div>)}</div>
          </section>

          <section className="panel history-card"><div className="section-heading"><div><h2>ประวัติล่าสุด</h2><p>แสดงเฉพาะรอบที่ส่งสำเร็จ เรียงจากล่าสุดไปเก่าสุด</p></div><button className="text-button" onClick={() => requestNavigation("history")}>ดูทั้งหมด</button></div><HistoryTable rows={remoteHistory.slice(0, 5)} onOpenDetail={(id) => void openAttemptDetail(id)} /></section>

          {backendMessage && <p className="system-note" role="status">{backendMessage}</p>}
        </div>}

        {view === "history" && <div className="page history-page">
          <div className="welcome"><div><p>ประวัติการฝึก</p><h1>ผลสอบที่ส่งสำเร็จทั้งหมด</h1><span>เรียงจากวันล่าสุดไปเก่าสุด และไม่แสดงรอบที่ถูกยกเลิกหรือพักค้างไว้</span></div><button className="secondary" onClick={() => requestNavigation("dashboard")}>กลับภาพรวม</button></div>
          <section className="panel history-card"><div className="section-heading"><div><h2>รายการประวัติ</h2><p>{remoteHistory.length ? `${remoteHistory.length} รอบที่ส่งสำเร็จ` : "ยังไม่มีผลสอบที่ส่งสำเร็จ"}</p></div><span className="updated">{backendStatus === "online" ? "ข้อมูลล่าสุดจาก Supabase" : "ออฟไลน์"}</span></div><HistoryTable rows={remoteHistory} onOpenDetail={(id) => void openAttemptDetail(id)} /></section>
        </div>}

        {view === "exam" && <div className="exam-page">
          <header className="exam-header"><div><button className="back-link" onClick={() => requestNavigation("dashboard")}>← กลับภาพรวม</button><h1>{activeTestTitle}</h1></div><div className="exam-metrics"><div><small>เวลาที่ทำจริง</small><b><i className={running ? "live-dot" : "live-dot paused"}/>{formatTime(seconds)}</b></div><div><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></div></div><button className="secondary pause-button" onClick={() => void pauseExam()} disabled={!running}>พักข้อสอบ</button></header>
          <div className="exam-body"><aside className="question-nav"><div><h2>รายการข้อ</h2><span>{remaining} ข้อยังไม่ตอบ</span></div><div className="question-grid">{questions.map((_, i) => { const state = i === current ? "current" : answers[i] !== undefined ? "answered" : states[i] === "paused" ? "skipped" : "empty"; return <button key={i} className={state} onClick={() => goTo(i)} aria-label={`ไปข้อ ${i + 1}`}>{i + 1}</button>; })}</div><div className="question-legend"><span><i className="answered"/>ตอบแล้ว</span><span><i className="skipped"/>ข้ามไว้</span><span><i className="current"/>ข้อปัจจุบัน</span></div></aside>
            <section className="question-stage">
              <div className="question-status"><span>ข้อ {current + 1} จาก {questions.length}</span><span>{answers[current] !== undefined ? "ตอบแล้ว" : states[current] === "paused" ? "ข้ามไว้" : "กำลังทำ"}</span><span>ข้อนี้ {formatTime(currentQuestionSeconds)}</span><span className={`save-state ${saved ? "show" : ""}`}>✓ บันทึกแล้ว</span></div>
              <article className="question-card">
                <small>{currentQuestion.subject} · ระดับ {formatLevelName(currentQuestion.category)} · {currentQuestion.level}</small>
                <RichContentView content={currentQuestion.content} fallback={currentQuestion.q} variant="question" />
                {currentQuestion.image && <img className="question-image" src={proxiedImageUrl("question", currentQuestion.id, currentQuestion.image)} alt={`รูปประกอบข้อ ${current + 1}`} loading="lazy" referrerPolicy="no-referrer" onError={handleImageFallback(currentQuestion.image)} />}
                <p>เลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียว</p>
                <div className="assist-row"><button className="hint-button" disabled={hinting || totalHintsUsed >= 2 || currentHints.length > 0 || backendStatus !== "online"} onClick={() => void handleHint()}>{hinting ? "กำลังตัดตัวเลือก…" : `Hint ${totalHintsUsed}/2`}</button><span>ตัดตัวเลือกผิด 2 ข้อ · หัก {hintPenalty.toFixed(1)} คะแนน</span></div>
                {currentHints.length > 0 && <div className="hint-stack" aria-live="polite">{currentHints.map((hint) => <p key={hint.hint_id}>{hint.hint_text}</p>)}</div>}
                <div className="choices">{currentQuestion.choices.map((choice, i) => {
                  const originalChoiceIndex = currentQuestion.choiceIndexes[i] ?? i;
                  const eliminated = eliminatedChoices.has(originalChoiceIndex);
                  const answerImageId = currentQuestion.choiceImageIds[i];
                  const answerImage = currentQuestion.choiceImages[i];
                  return <button key={`${currentQuestion.id}-${i}`} disabled={eliminated} className={`${answers[current] === i ? "selected" : ""} ${eliminated ? "eliminated" : ""}`} onClick={() => choose(i)}>
                    <span className="choice-letter">{String.fromCharCode(65 + i)}</span>
                    <span className="choice-copy"><RichContentView content={currentQuestion.choiceContents[i]} fallback={choice} variant="choice" />{answerImageId && answerImage && <img className="choice-image" src={proxiedImageUrl("answer", answerImageId, answerImage)} alt={`รูปประกอบตัวเลือก ${String.fromCharCode(65 + i)}`} loading="lazy" referrerPolicy="no-referrer" onError={handleImageFallback(answerImage)} />}</span>
                    <i>{eliminated ? "ตัดออก" : answers[current] === i ? "✓" : ""}</i>
                  </button>;
                })}</div>
              </article>
              {backendMessage && <p className="system-note" role="status">{backendMessage}</p>}
              <div className="exam-footer"><button className="secondary" disabled={current === 0} onClick={() => goTo(current - 1)}>ย้อนกลับ</button><button className="skip" onClick={() => { void syncQuestionLog(current, "skip", "skipped"); setStates((p) => ({ ...p, [current]: "paused" })); if (current < questions.length - 1) goTo(current + 1); }}>ข้ามข้อนี้</button>{current < questions.length - 1 ? <button className="primary" onClick={() => goTo(current + 1)}>ข้อถัดไป →</button> : <button className="primary" disabled={submitting} onClick={() => void handleSubmit()}>{submitting ? "กำลังตรวจคะแนน…" : "ส่งข้อสอบ"}</button>}</div>
            </section>
          </div>
        </div>}

        <nav className="mobile-nav" aria-label="เมนูบนมือถือ"><button className={view === "dashboard" ? "active" : ""} onClick={() => requestNavigation("dashboard")}><Glyph>⌂</Glyph><span>ภาพรวม</span></button><button className={view === "history" ? "active" : ""} onClick={() => requestNavigation("history")}><Glyph>◷</Glyph><span>ประวัติ</span></button><button className={view === "exam" ? "active" : ""} onClick={openCatalog}><Glyph>✓</Glyph><span>ข้อสอบ</span></button></nav>
      </section>

      {startOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="start-title"><div className="modal wide"><span className="modal-icon start">→</span><h2 id="start-title">พร้อมเริ่มทำข้อสอบหรือยัง?</h2><p>เมื่อยืนยัน ระบบจะสร้างรอบทำข้อสอบใหม่และเริ่มนับเวลาทันที</p><div className="resume-summary detailed">
        <span><small>ระดับข้อสอบ</small><b>{activeTestTitle}</b></span>
        <span><small>วิชา / ระดับ</small><b>{selectedTest.subject} · ระดับ {formatLevelName(selectedTest.category)}</b></span>
        <span><small>จำนวนข้อ</small><b>{selectedTest.question_count} ข้อ</b></span>
        <span><small>เวลาแนะนำ</small><b>{formatDurationLong(selectedTest.duration)}</b></span>
      </div><button className="primary full" disabled={starting} onClick={() => void confirmStartExam()}>{starting ? "กำลังตรวจสอบสถานะ…" : "ยืนยัน เริ่มทำข้อสอบ"}</button><button className="danger-link neutral" disabled={starting} onClick={() => setStartOpen(false)}>กลับไปเลือกระดับ</button></div></div>}
      {replaceOpen && pendingTest && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="replace-title"><div className="modal wide"><span className="modal-icon warning">!</span><h2 id="replace-title">เริ่มรอบสอบใหม่?</h2><p>หากเริ่ม <b>{formatTestTitle(pendingTest)}</b> ระบบจะยกเลิกรอบสอบเดิมที่ค้างอยู่ทั้งหมด และสร้าง Test session ใหม่ทันที</p><div className="resume-summary detailed">
        <span><small>แบบทดสอบเดิม</small><b>{activeTestTitle}</b></span>
        <span><small>วิชา / ระดับ</small><b>{selectedTest.subject} · ระดับ {formatLevelName(selectedTest.category)}</b></span>
        <span><small>ทำไปแล้ว</small><b>{answeredCount}/{questions.length || selectedTest.question_count} ข้อ</b></span>
        <span><small>เวลาทำจริง</small><b>{formatDurationLong(seconds)}</b></span>
        <span><small>ข้อที่เคยเปิดดู</small><b>{touchedQuestions} ข้อ</b></span>
        <span><small>เวลาเฉลี่ย</small><b>{formatPace(averageActiveQuestionSeconds)}</b></span>
      </div><button className="primary full" onClick={() => void confirmReplaceAttempt()}>ยืนยัน เริ่มรอบใหม่และยกเลิกรอบเก่า</button><button className="danger-link neutral" onClick={() => { setPendingTest(null); setReplaceOpen(false); }}>กลับไปทำรอบเดิม</button></div></div>}
      {resumeOpen && !cancelOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="resume-title"><div className="modal wide pause-modal"><span className="modal-icon">Ⅱ</span><h2 id="resume-title">พักการทำข้อสอบแล้ว</h2><p>เวลาทำจริงหยุดนับแล้ว คุณสามารถพักหรือสลับแท็บได้ แต่ต้องเปิดหน้านี้ค้างไว้เพื่อรักษารอบทำข้อสอบ</p><div className="pause-duration"><small>พักมาแล้ว</small><b>{formatDurationLong(pauseSeconds)}</b><span>เริ่มพักใหม่ทุกครั้งที่กดพักข้อสอบ</span></div><div className="resume-summary detailed"><span><small>ระดับข้อสอบ</small><b>{activeTestTitle}</b></span><span><small>ความคืบหน้า</small><b>{answeredCount}/{questions.length} ข้อ</b></span><span><small>เวลาที่ทำจริง</small><b>{formatDurationLong(seconds)}</b></span><span><small>เวลาต่อข้อเฉลี่ย</small><b>{formatPace(averageActiveQuestionSeconds)}</b></span></div><button className="primary full" onClick={resumeExam}>ทำข้อสอบต่อ</button><button className="danger-link" onClick={() => setCancelOpen(true)}>ยกเลิกแบบทดสอบ</button></div></div>}
      {cancelOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="cancel-title"><div className="modal wide"><span className="modal-icon warning">!</span><h2 id="cancel-title">ยกเลิกแบบทดสอบนี้?</h2><p>คำตอบและ Log ของรอบนี้จะไม่ถูกนำไปเป็นผลสอบหรือประวัติการฝึก และจะเริ่มต่อจากจุดเดิมไม่ได้</p><div className="resume-summary detailed"><span><small>ระดับข้อสอบ</small><b>{activeTestTitle}</b></span><span><small>ทำไปแล้ว</small><b>{answeredCount}/{questions.length} ข้อ</b></span><span><small>เวลาที่ทำจริง</small><b>{formatDurationLong(seconds)}</b></span><span><small>ข้อที่เคยเปิดดู</small><b>{touchedQuestions} ข้อ</b></span></div><button className="danger-button full" disabled={cancelling} onClick={() => void cancelAttempt()}>{cancelling ? "กำลังยกเลิก…" : "ยืนยัน ยกเลิกแบบทดสอบ"}</button><button className="danger-link neutral" disabled={cancelling} onClick={() => setCancelOpen(false)}>กลับไปทำข้อสอบต่อ</button></div></div>}
      {activeTestLock && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="lock-title"><div className="modal wide lock-modal"><span className="modal-icon warning">!</span><p className="modal-kicker">ระบบใช้ได้ทีละคน</p><h2 id="lock-title">มีคนกำลังทำข้อสอบอยู่</h2><p>ยังเริ่มรอบใหม่ไม่ได้จนกว่ารอบที่กำลังทำอยู่จะส่งผลหรือถูกยกเลิก</p><div className="resume-summary detailed"><span><small>วิชา / ระดับ</small><b>{activeTestLock.title.replaceAll("ชุดที่", "ระดับ")}</b></span><span><small>สถานะ</small><b>{activeTestLock.status === "paused" ? "พักข้อสอบ" : "กำลังทำข้อสอบ"}</b></span><span><small>ทำไปแล้ว</small><b>{activeTestLock.answered_count}/{activeTestLock.total_questions} ข้อ</b></span><span><small>เวลาที่ใช้</small><b>{formatDurationLong(activeTestLock.elapsed_seconds)}</b></span></div><button className="primary full" onClick={() => { setActiveTestLock(null); void confirmStartExam(); }}>ตรวจสอบอีกครั้ง</button><button className="danger-link neutral" onClick={() => { setActiveTestLock(null); setStartOpen(false); }}>กลับไปเลือกระดับ</button></div></div>}
      {calendarDayKey && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title"><div className="modal wide calendar-modal">
        <div className="detail-header"><div><p className="modal-kicker">Calendar Detail</p><h2 id="calendar-detail-title">{formatFullThaiDate(calendarDayKey)}</h2><span>{selectedCalendarRows.length} รอบสอบที่ส่งสำเร็จในวันนี้</span></div><button className="icon-button" aria-label="ปิดรายละเอียดวันในปฏิทิน" onClick={() => setCalendarDayKey(null)}>×</button></div>
        <HistoryTable rows={selectedCalendarRows} onOpenDetail={(id) => { setCalendarDayKey(null); void openAttemptDetail(id); }} />
      </div></div>}
      {submitOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="submit-title"><div className="modal"><span className="modal-icon warning">!</span><h2 id="submit-title">ยังเหลือ {remaining} ข้อ</h2><p>ตรวจคำตอบให้ครบก่อนส่ง เพื่อให้ระบบวิเคราะห์ผลได้แม่นยำ</p><div className="missing-list">{questions.map((_, i) => answers[i] === undefined && <button key={i} onClick={() => { setSubmitOpen(false); goTo(i); }}>ข้อ {i + 1}</button>)}</div><button className="primary full" onClick={() => { setSubmitOpen(false); const n = questions.findIndex((_, i) => answers[i] === undefined); if (n >= 0) goTo(n); }}>ไปข้อที่ยังไม่ตอบ</button><button className="danger-link neutral" onClick={() => setSubmitOpen(false)}>กลับไปตรวจคำตอบ</button></div></div>}
      {(detailLoading || detailError || attemptDetail) && <div className="modal-backdrop detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="attempt-detail-title"><div className="modal insight-modal">
        <div className="detail-header"><div><p className="modal-kicker">Insight เฉพาะรอบสอบ</p><h2 id="attempt-detail-title">{attemptDetail ? formatSubjectLevel(attemptDetail.attempt.subject, attemptDetail.attempt.category) : "กำลังโหลดรายละเอียด"}</h2><span>{attemptDetail ? `ส่งเมื่อ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(attemptDetail.attempt.submitted_at))}` : "ดึงเฉพาะ Log ของรอบนี้จาก Supabase"}</span></div><button className="icon-button" aria-label="ปิด Insight" onClick={() => { setAttemptDetail(null); setDetailError(""); setSelectedLogQuestion(null); }}>×</button></div>
        {detailLoading && <div className="detail-loading">กำลังโหลด Dashboard ของรอบสอบนี้…</div>}
        {detailError && !detailLoading && <div className="table-empty">{detailError}</div>}
        {attemptDetail && !detailLoading && <div className="attempt-dashboard">
          <div className="attempt-score-card">
            <div><span>คะแนน</span><b>{attemptDetail.attempt.correct_count}/{attemptDetail.attempt.total_questions}</b><small>คะแนนหลังหัก Hint {Number(attemptDetail.attempt.score).toFixed(1)}</small></div>
            <div><span>ความแม่นยำ</span><b>{Math.round(Number(attemptDetail.attempt.accuracy))}%</b><small>ผิด {attemptDetail.summary.wrong_count} ข้อ</small></div>
            <div><span>เวลารวม</span><b>{formatDurationLong(attemptDetail.attempt.elapsed_seconds)}</b><small>เฉลี่ย {formatPace(attemptDetail.summary.avg_seconds_per_question)}</small></div>
            <div><span>ข้อที่ช้าที่สุด</span><b>{detailSlowest ? `ข้อ ${detailSlowest.position}` : "—"}</b><small>{detailSlowest ? formatDurationLong(detailSlowest.duration_seconds) : "ยังไม่มี Log"}</small></div>
          </div>
          <div className="attempt-split">
            <article>
              <h3>ภาพรวมรอบนี้</h3>
              <div className="mini-bars"><span><b>ถูก</b><i style={{ width: `${Math.max(4, (detailCorrectQuestions.length / Math.max(1, detailQuestions.length)) * 100)}%` }} />{detailCorrectQuestions.length} ข้อ</span><span><b>ผิด</b><i className="bad" style={{ width: `${Math.max(4, (detailWrongQuestions.length / Math.max(1, detailQuestions.length)) * 100)}%` }} />{detailWrongQuestions.length} ข้อ</span><span><b>ใช้ Hint</b><i className="warn" style={{ width: `${Math.max(4, (attemptDetail.attempt.hint_count / 2) * 100)}%` }} />{attemptDetail.attempt.hint_count} ครั้ง</span></div>
            </article>
            <article>
              <h3>คำแนะนำ</h3>
              <p>{detailWrongQuestions.length ? `เริ่มทบทวนจากข้อที่ผิด ${detailWrongQuestions.length} ข้อก่อน โดยเฉพาะข้อที่ใช้เวลานานและผิดพร้อมกัน` : "รอบนี้ยังไม่พบข้อผิด ให้ใช้ตารางด้านล่างดูข้อที่ใช้เวลานานเพื่อเพิ่มความเร็ว"}</p>
            </article>
          </div>
          <div className="question-log-table">
            <div className="question-log-head"><span>ข้อ</span><span>ผล</span><span>เวลา</span><span>คำตอบที่เลือก</span><span>Insight</span></div>
            {attemptDetail.questions.map((item) => <button className={`question-log-row ${item.status === "incorrect" ? "wrong" : item.status === "correct" ? "right" : ""}`} key={item.log_id} onClick={() => setSelectedLogQuestion(item)}>
              <span>ข้อ {item.position}</span><span>{questionResultLabel(item.status)}</span><span>{formatDurationLong(item.duration_seconds)}</span><span>{item.selected_answer || "—"}</span><span>{questionInsightText(item)}</span>
            </button>)}
          </div>
        </div>}
      </div></div>}
      {selectedLogQuestion && <div className="modal-backdrop nested detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="question-insight-title"><div className="modal question-insight-modal">
        <div className="detail-header"><div><p className="modal-kicker">Insight รายข้อ</p><h2 id="question-insight-title">ข้อ {selectedLogQuestion.position} · {questionResultLabel(selectedLogQuestion.status)}</h2><span>{formatSubjectLevel(selectedLogQuestion.subject, selectedLogQuestion.category)} · ใช้เวลา {formatDurationLong(selectedLogQuestion.duration_seconds)}</span></div><button className="icon-button" aria-label="ปิด Insight รายข้อ" onClick={() => setSelectedLogQuestion(null)}>×</button></div>
        <div className={`result-strip ${selectedLogQuestion.status === "incorrect" ? "wrong" : "right"}`}><b>{questionInsightText(selectedLogQuestion)}</b><span>{selectedLogQuestion.used_hint ? `ใช้ Hint ${selectedLogQuestion.hint_count} ครั้งในข้อนี้` : "ไม่ใช้ Hint ในข้อนี้"}</span></div>
        <article className="question-review"><h3>โจทย์</h3><p>{selectedLogQuestion.question}</p></article>
        <div className="answer-review-grid">
          <div><span>คำตอบที่เลือก</span><b>{selectedLogQuestion.selected_answer || "ไม่ได้เลือกคำตอบ"}</b></div>
          <div><span>เฉลยที่ถูก</span><b>{selectedLogQuestion.correct_answer || "ไม่มีข้อมูลเฉลย"}</b></div>
        </div>
        <article className="explanation-card"><h3>คำอธิบาย</h3>{isImageSourceLink(selectedLogQuestion.explanation) ? <img className="explanation-image" src={safeDirectImageUrl(selectedLogQuestion.explanation)} alt={`รูปคำอธิบายข้อ ${selectedLogQuestion.position}`} loading="lazy" referrerPolicy="no-referrer" onError={handleImageFallback(selectedLogQuestion.explanation)} /> : <p>{selectedLogQuestion.explanation || "ยังไม่มีคำอธิบายสำหรับข้อนี้ในฐานข้อมูล"}</p>}</article>
        <button className="primary full" onClick={() => setSelectedLogQuestion(null)}>กลับไปดู Dashboard รอบนี้</button>
      </div></div>}
      {result && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title"><div className="modal"><span className="modal-icon result">✓</span><h2 id="result-title">ตรวจคะแนนเรียบร้อย</h2><p>คุณตอบถูก <b>{result.correct_count} จาก {result.total_questions} ข้อ</b> คะแนนหลังหัก Hint <b>{Number(result.score).toFixed(1)}</b></p><div className="resume-summary"><span><small>Hint ที่ใช้</small><b>{result.hint_count} ครั้ง (-{Number(result.hint_penalty).toFixed(1)})</b></span><span><small>ความแม่นยำ</small><b>{Math.round(Number(result.accuracy))}%</b></span></div><button className="primary full" onClick={() => { setResult(null); setView("dashboard"); }}>กลับไปดูพัฒนาการ</button></div></div>}
    </main>
  );
}
