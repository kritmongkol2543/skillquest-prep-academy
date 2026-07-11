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
  question_sets: { title: string; subject: string } | null;
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
  ranking_points: number;
  ranked: boolean;
  duplicate: boolean;
};

export async function ensureAnonymousSession(displayName: string) {
  let { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) {
    const signedIn = await supabase.auth.signInAnonymously();
    if (signedIn.error) throw signedIn.error;
    session = signedIn.data.session;
  }
  if (!session?.user) throw new Error("SESSION_UNAVAILABLE");

  const cleanName = displayName.trim().slice(0, 24) || "ผู้เตรียมสอบ";
  const profile = await supabase.from("profiles").upsert(
    { user_id: session.user.id, display_name: cleanName, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (profile.error) throw profile.error;
  return session.user;
}

export async function saveRemoteProfile(displayName: string) {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("AUTH_REQUIRED");
  const { error } = await supabase.from("profiles").upsert(
    { user_id: user.id, display_name: displayName.trim().slice(0, 24), updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

export async function loadRemoteAttempts() {
  const { data, error } = await supabase
    .from("attempts")
    .select("id,accuracy,correct_count,total_questions,elapsed_seconds,ranked,submitted_at,question_sets(title,subject)")
    .order("submitted_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as RemoteAttempt[];
}

export async function loadLeaderboard() {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    body: { action: "leaderboard", limit: 20 },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.data ?? []) as LeaderboardEntry[];
}

export async function submitRemoteAttempt(payload: {
  set_id: string;
  answers: Record<string, number>;
  elapsed_seconds: number;
  client_nonce: string;
}) {
  const { data, error } = await supabase.functions.invoke("skillquest-api", {
    body: { action: "submit_attempt", payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.data as AttemptResult;
}
