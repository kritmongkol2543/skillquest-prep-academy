import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

const ALLOWED_SITES_ORIGIN = "https://skillquest-player-hub.kritmongkol2543.chatgpt.site";
const MAX_BODY_BYTES = 32_768;

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (origin === ALLOWED_SITES_ORIGIN) return true;
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/.test(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : ALLOWED_SITES_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return json(origin, { error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(origin, { error: "METHOD_NOT_ALLOWED" }, 405);

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return json(origin, { error: "PAYLOAD_TOO_LARGE" }, 413);

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(origin, { error: "AUTH_REQUIRED" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(origin, { error: "SERVICE_UNAVAILABLE" }, 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json(origin, { error: "INVALID_SESSION" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(origin, { error: "INVALID_JSON" }, 400);
  }

  if (body.action === "leaderboard") {
    const rawLimit = typeof body.limit === "number" ? Math.trunc(body.limit) : 20;
    const limit = Math.min(50, Math.max(1, rawLimit));
    const { data, error } = await admin.rpc("get_leaderboard", { p_limit: limit });
    if (error) return json(origin, { error: "DATA_UNAVAILABLE" }, 503);
    return json(origin, { data });
  }

  if (body.action === "save_profile") {
    const displayName = typeof body.display_name === "string" ? body.display_name : "ผู้เตรียมสอบ";
    const { data, error } = await admin.rpc("upsert_profile_service", {
      p_user_id: authData.user.id,
      p_display_name: displayName,
    });
    if (error) return json(origin, { error: "PROFILE_SAVE_FAILED" }, 503);
    return json(origin, { data });
  }

  if (body.action === "list_tests") {
    const { data, error } = await admin.rpc("list_tests_service");
    if (error) return json(origin, { error: "TESTS_UNAVAILABLE" }, 503);
    return json(origin, { data });
  }

  if (body.action === "get_test") {
    const testId = body.test_id;
    if (typeof testId !== "string") return json(origin, { error: "INVALID_TEST" }, 400);
    const { data, error } = await admin.rpc("get_test_questions_service", { p_test_id: testId });
    if (error) return json(origin, { error: "TEST_UNAVAILABLE" }, 503);
    if (!data) return json(origin, { error: "TEST_NOT_FOUND" }, 404);
    return json(origin, { data });
  }

  if (body.action === "attempt_history") {
    const rawLimit = typeof body.limit === "number" ? Math.trunc(body.limit) : 10;
    const limit = Math.min(50, Math.max(1, rawLimit));
    const { data, error } = await admin.rpc("get_attempt_history_service", {
      p_user_id: authData.user.id,
      p_limit: limit,
    });
    if (error) return json(origin, { error: "HISTORY_UNAVAILABLE" }, 503);
    return json(origin, { data });
  }

  if (body.action === "dashboard_summary") {
    const { data, error } = await admin.rpc("get_dashboard_summary_service", {
      p_user_id: authData.user.id,
    });
    if (error) return json(origin, { error: "DASHBOARD_UNAVAILABLE" }, 503);
    return json(origin, { data });
  }

  if (body.action === "learning_insights") {
    const { data, error } = await admin.rpc("get_learning_insights_service", {
      p_user_id: authData.user.id,
    });
    if (error) return json(origin, { error: "INSIGHTS_UNAVAILABLE" }, 503);
    return json(origin, { data });
  }

  if (body.action === "log_question") {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== "object") return json(origin, { error: "INVALID_LOG" }, 400);

    const setId = payload.set_id;
    const questionId = payload.question_id;
    const clientNonce = payload.client_nonce;
    const eventType = payload.event_type;
    const status = payload.status;
    const durationSeconds = payload.duration_seconds;
    const selectedChoice = payload.selected_choice;
    if (
      typeof setId !== "string" || typeof questionId !== "string" || typeof clientNonce !== "string" ||
      typeof eventType !== "string" || typeof status !== "string" ||
      typeof durationSeconds !== "number" || !Number.isInteger(durationSeconds) ||
      (selectedChoice !== null && selectedChoice !== undefined && (typeof selectedChoice !== "number" || !Number.isInteger(selectedChoice)))
    ) return json(origin, { error: "INVALID_LOG" }, 400);

    const { data, error } = await admin.rpc("log_question_activity_service", {
      p_user_id: authData.user.id,
      p_set_id: setId,
      p_client_nonce: clientNonce,
      p_question_id: questionId,
      p_event_type: eventType,
      p_duration_seconds: durationSeconds,
      p_selected_choice: selectedChoice ?? null,
      p_status: status,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("INVALID_") || message.includes("NOT_AVAILABLE")) return json(origin, { error: "INVALID_LOG" }, 400);
      return json(origin, { error: "LOG_FAILED" }, 503);
    }
    return json(origin, { data });
  }

  if (body.action === "use_hint") {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== "object") return json(origin, { error: "INVALID_HINT" }, 400);

    const setId = payload.set_id;
    const questionId = payload.question_id;
    const clientNonce = payload.client_nonce;
    const durationSeconds = payload.duration_seconds;
    if (
      typeof setId !== "string" || typeof questionId !== "string" || typeof clientNonce !== "string" ||
      typeof durationSeconds !== "number" || !Number.isInteger(durationSeconds)
    ) return json(origin, { error: "INVALID_HINT" }, 400);

    const { data, error } = await admin.rpc("use_hint_service", {
      p_user_id: authData.user.id,
      p_set_id: setId,
      p_client_nonce: clientNonce,
      p_question_id: questionId,
      p_duration_seconds: durationSeconds,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("HINT_LIMIT_REACHED")) return json(origin, { error: "HINT_LIMIT_REACHED" }, 429);
      if (message.includes("INVALID_") || message.includes("NOT_AVAILABLE")) return json(origin, { error: "INVALID_HINT" }, 400);
      return json(origin, { error: "HINT_FAILED" }, 503);
    }
    return json(origin, { data });
  }

  if (body.action === "submit_attempt") {
    const payload = body.payload as Record<string, unknown> | undefined;
    if (!payload || typeof payload !== "object") return json(origin, { error: "INVALID_ATTEMPT" }, 400);

    const setId = payload.set_id;
    const answers = payload.answers;
    const elapsedSeconds = payload.elapsed_seconds;
    const clientNonce = payload.client_nonce;
    if (
      typeof setId !== "string" || typeof clientNonce !== "string" ||
      typeof elapsedSeconds !== "number" || !Number.isInteger(elapsedSeconds) ||
      !answers || typeof answers !== "object" || Array.isArray(answers)
    ) return json(origin, { error: "INVALID_ATTEMPT" }, 400);

    const { data, error } = await admin.rpc("submit_attempt_service", {
      p_user_id: authData.user.id,
      p_set_id: setId,
      p_answers: answers,
      p_elapsed_seconds: elapsedSeconds,
      p_client_nonce: clientNonce,
    });

    if (error) {
      const message = error.message ?? "";
      if (message.includes("RATE_LIMITED")) return json(origin, { error: "RATE_LIMITED" }, 429);
      if (message.includes("INVALID_") || message.includes("SET_NOT_AVAILABLE")) return json(origin, { error: "INVALID_ATTEMPT" }, 400);
      return json(origin, { error: "SUBMIT_FAILED" }, 503);
    }
    return json(origin, { data });
  }

  return json(origin, { error: "UNKNOWN_ACTION" }, 400);
});
