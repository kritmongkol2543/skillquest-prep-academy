import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://pttsjpmwvppkaacgzdqh.supabase.co";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_zb5948wh4FMpMYOyqB3O0w_KT05tg-W";
let cachedUnloadHeaders: Record<string, string> | null = null;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

export type RemoteAttempt = {
  id: string;
  accuracy: number;
  correct_count: number;
  total_questions: number;
  elapsed_seconds: number;
  ranked: boolean;
  submitted_at: string;
  Test: { Question: string; Subject: string } | null;
};

export type RemoteTest = {
  test_id: string;
  category_id?: string;
  title: string;
  subject: string;
  subject_id?: string;
  category: string;
  level: string;
  duration: number;
  question_count: number;
  status?: "catalog" | "in_progress" | "paused" | "cancelled" | "submitted";
};

export type RemoteQuestionChoice = {
  answer_id: string;
  choice_index: number;
  answer: string;
  image: string | null;
};

export type RemoteQuestion = {
  id: string;
  question: string;
  subject_id: string;
  category_id: string;
  level: string;
  image: string | null;
  position: number;
  choices: RemoteQuestionChoice[];
};

export type RemoteTestPayload = {
  test: RemoteTest;
  questions: RemoteQuestion[];
};

export type ActiveTestLock = {
  test_id: string;
  title: string;
  subject: string;
  category: string;
  status: "in_progress" | "paused";
  started_at: string;
  elapsed_seconds: number;
  answered_count: number;
  touched_questions: number;
  total_questions: number;
};

export type StartTestResult = RemoteTest | {
  blocked: true;
  active_test: ActiveTestLock;
};

export type DashboardSubjectSummary = {
  subject: string;
  attempts: number;
  accuracy: number;
  active_seconds: number;
};

export type DashboardSummary = {
  attempts_count: number;
  average_accuracy: number;
  active_seconds: number;
  answered_logs: number;
  last_activity_at: string | null;
  subjects: DashboardSubjectSummary[];
};

export type LearningInsightOverview = {
  questions_seen: number;
  total_question_seconds: number;
  avg_seconds_per_question: number;
  median_seconds_per_question: number;
  attempts_count: number;
  average_accuracy: number;
  hint_count: number;
  last_activity_at: string | null;
};

export type LearningInsightSubject = {
  subject: string;
  questions_seen: number;
  total_seconds: number;
  avg_seconds: number;
  accuracy: number;
  wrong_count: number;
  scored_count: number;
};

export type LearningInsightCategory = LearningInsightSubject & {
  category: string;
};

export type LearningInsightQuestion = {
  question_id: string;
  question: string;
  subject: string;
  category: string;
  duration_seconds: number;
  status: string;
  reason: string;
};

export type LearningInsightRecommendation = {
  type: "accuracy" | "speed" | "careless";
  title: string;
  body: string;
  priority: "high" | "medium" | "low";
};

export type LearningInsights = {
  overview: LearningInsightOverview;
  subjects: LearningInsightSubject[];
  categories: LearningInsightCategory[];
  slow_questions: LearningInsightQuestion[];
  recommendations: LearningInsightRecommendation[];
};

export type LeaderboardEntry = {
  rank_position: number;
  public_id: string;
  display_name: string;
  ranking_points: number;
  attempts_count: number;
  accuracy_avg: number;
  active_seconds: number;
  updated_at: string;
};

export type AttemptResult = {
  attempt_id: string;
  correct_count: number;
  total_questions: number;
  accuracy: number;
  score: number;
  hint_count: number;
  hint_penalty: number;
  ranking_points: number;
  ranked: boolean;
  duplicate: boolean;
};

export type QuestionLogEvent = "enter" | "heartbeat" | "answer" | "pause" | "skip" | "submit" | "hint";
export type QuestionLogStatus = "viewed" | "answered" | "changed_answer" | "skipped" | "paused" | "submitted";

export type HintResult = {
  hint_id: string;
  hint_text: string;
  hint_type: string;
  eliminated_choices: number[];
  point_penalty: number;
  hints_used: number;
  hints_remaining: number;
  total_penalty: number;
};

export async function ensureAnonymousSession(displayName: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  let { session } = data;
  if (!session) {
    const signedIn = await supabase.auth.signInAnonymously();
    if (signedIn.error) throw signedIn.error;
    session = signedIn.data.session;
  }
  if (!session?.user) throw new Error("SESSION_UNAVAILABLE");
  cachedUnloadHeaders = {
    Authorization: `Bearer ${session.access_token}`,
    apikey: supabasePublishableKey,
  };
  localStorage.setItem("skillquest-name", displayName.trim().slice(0, 24) || "ผู้เตรียมสอบ");
  return session.user;
}

async function getSessionHeaders() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("AUTH_REQUIRED");

  const headers = {
    Authorization: `Bearer ${session.access_token}`,
    apikey: supabasePublishableKey,
  };
  cachedUnloadHeaders = headers;
  return headers;
}

export async function saveRemoteProfile(displayName: string) {
  await ensureAnonymousSession(displayName);
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "save_profile", display_name: displayName },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data;
}

export async function loadRemoteTests() {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "list_tests" },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.data ?? []) as RemoteTest[];
}

export async function loadRemoteTest(testId: string) {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "get_test", test_id: testId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data as RemoteTestPayload;
}

export async function startRemoteTest(categoryId: string, clientNonce: string, clientInstanceId: string) {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "start_test", category_id: categoryId, client_nonce: clientNonce, client_instance_id: clientInstanceId },
  });
  if (data?.error) throw new Error(data.error);
  if (error) throw error;
  return data?.data as StartTestResult;
}

export async function heartbeatRemoteTest(testId: string, clientInstanceId: string) {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "heartbeat_test", test_id: testId, client_instance_id: clientInstanceId },
  });
  if (data?.error) throw new Error(data.error);
  if (error) throw error;
  return data?.data as { test_id: string; status: "in_progress" | "paused" | "cancelled"; heartbeat_at: string | null; active?: boolean };
}

export async function pauseRemoteTest(testId: string) {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "pause_test", test_id: testId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data as { test_id: string; status: string; paused_at: string };
}

export async function cancelRemoteTest(testId: string) {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "cancel_test", test_id: testId },
  });
  if (data?.error) throw new Error(data.error);
  if (error) throw error;
  return data?.data as { test_id: string; status: "cancelled"; cancelled_at?: string; already_cancelled?: boolean };
}

/**
 * Requests cancellation as the page is being replaced or closed. The request is
 * intentionally fire-and-forget: unload handlers cannot await network work.
 */
export function cancelRemoteTestOnPageExit(testId: string) {
  if (!testId || !cachedUnloadHeaders || typeof window === "undefined") return;
  void fetch(`${supabaseUrl}/functions/v1/skillquest-api`, {
    method: "POST",
    headers: { ...cachedUnloadHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "cancel_test", test_id: testId }),
    keepalive: true,
  }).catch(() => undefined);
}

export async function loadRemoteAttempts() {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "attempt_history", limit: 50 },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.data ?? []) as RemoteAttempt[];
}

export async function loadDashboardSummary() {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "dashboard_summary" },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data as DashboardSummary;
}

export async function loadLearningInsights() {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "learning_insights" },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data as LearningInsights;
}

export async function loadLeaderboard() {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "leaderboard", limit: 20 },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.data ?? []) as LeaderboardEntry[];
}

export async function logQuestionActivity(payload: {
  set_id: string;
  question_id: string;
  client_nonce: string;
  event_type: QuestionLogEvent;
  duration_seconds: number;
  selected_choice?: number | null;
  status: QuestionLogStatus;
}) {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "log_question", payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data?.data as { log_id: string; duration_seconds: number; view_count: number; status: string };
}

export async function requestRemoteHint(payload: {
  set_id: string;
  question_id: string;
  client_nonce: string;
  duration_seconds: number;
}) {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "use_hint", payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.data as HintResult;
}

export async function submitRemoteAttempt(payload: {
  set_id: string;
  answers: Record<string, number>;
  elapsed_seconds: number;
  client_nonce: string;
}) {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    headers: await getSessionHeaders(),
    body: { action: "submit_attempt", payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.data as AttemptResult;
}
