import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://pttsjpmwvppkaacgzdqh.supabase.co";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_zb5948wh4FMpMYOyqB3O0w_KT05tg-W";

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
  localStorage.setItem("skillquest-name", displayName.trim().slice(0, 24) || "ผู้เตรียมสอบ");
  return session.user;
}

async function getSessionHeaders() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("AUTH_REQUIRED");

  return {
    Authorization: `Bearer ${session.access_token}`,
    apikey: supabasePublishableKey,
  };
}

export async function saveRemoteProfile(displayName: string) {
  await ensureAnonymousSession(displayName);
}

export async function loadRemoteAttempts() {
  // The ER-aligned backend stores per-question analysis in "Log" instead of
  // exposing old attempt/question_set tables directly to the browser.
  // Dashboard examples remain local until a dedicated history RPC is added.
  return [] as RemoteAttempt[];
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
