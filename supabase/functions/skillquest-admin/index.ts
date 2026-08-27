import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_CHATGPT_ORIGIN = "https://skillquest-player-hub.kritmongkol2543.chatgpt.site";
const BUCKET = "exam-images";
const MAX_BODY_BYTES = 2_000_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SESSION_HOURS = 12;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (origin === ALLOWED_CHATGPT_ORIGIN) return true;
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : ALLOWED_CHATGPT_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function verifyAdminSession(admin: ReturnType<typeof createClient>, userId: string, rawToken: unknown) {
  if (typeof rawToken !== "string" || rawToken.length < 32 || rawToken.length > 256) return false;
  const tokenHash = await sha256Hex(rawToken);
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("ExamAuthoringSession")
    .select("SessionID")
    .eq("TokenHash", tokenHash)
    .eq("UserID", userId)
    .gt("ExpiresAt", nowIso)
    .maybeSingle();
  if (error || !data) return false;
  await admin.from("ExamAuthoringSession").update({ LastUsedAt: nowIso }).eq("SessionID", data.SessionID);
  return true;
}

function validateExamPayload(subjectId: unknown, title: unknown, questions: unknown) {
  if (!isUuid(subjectId)) return "INVALID_SUBJECT";
  if (typeof title !== "string" || !title.trim() || title.trim().length > 120) return "INVALID_TITLE";
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 500) return "INVALID_QUESTIONS";

  for (const rawQuestion of questions) {
    if (!rawQuestion || typeof rawQuestion !== "object" || Array.isArray(rawQuestion)) return "INVALID_QUESTION";
    const question = rawQuestion as Record<string, unknown>;
    const questionText = typeof question.question === "string" ? question.question.trim() : "";
    const questionImage = typeof question.image === "string" ? question.image.trim() : "";
    if (!questionText && !questionImage) return "QUESTION_CONTENT_REQUIRED";
    if (questionText.length > 8000) return "QUESTION_TOO_LONG";

    if (!Array.isArray(question.choices) || question.choices.length < 2 || question.choices.length > 32767) {
      return "AT_LEAST_TWO_CHOICES_REQUIRED";
    }
    let correctCount = 0;
    for (const rawChoice of question.choices) {
      if (!rawChoice || typeof rawChoice !== "object" || Array.isArray(rawChoice)) return "INVALID_CHOICE";
      const choice = rawChoice as Record<string, unknown>;
      const text = typeof choice.text === "string" ? choice.text.trim() : "";
      const image = typeof choice.image === "string" ? choice.image.trim() : "";
      if (!text && !image) return "CHOICE_CONTENT_REQUIRED";
      if (text.length > 4000) return "CHOICE_TOO_LONG";
      if (choice.correct === true) correctCount += 1;
    }
    if (correctCount !== 1) return "EXACTLY_ONE_CORRECT_CHOICE_REQUIRED";
  }
  return null;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json(origin, { error: "SERVICE_UNAVAILABLE" }, 503);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = authHeader.slice(7);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json(origin, { error: "INVALID_SESSION" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json(origin, { error: "INVALID_JSON" }, 400);
  }

  if (body.action === "login") {
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (code.length < 12 || code.length > 128) return json(origin, { error: "INVALID_ADMIN_CODE" }, 401);
    const codeHash = await sha256Hex(code);
    const { data: config, error: configError } = await admin
      .from("ExamAuthoringAdmin")
      .select("CodeHash")
      .eq("ID", 1)
      .maybeSingle();
    if (configError || !config) return json(origin, { error: "ADMIN_NOT_CONFIGURED" }, 503);
    if (config.CodeHash !== codeHash) return json(origin, { error: "INVALID_ADMIN_CODE" }, 401);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
    await admin.from("ExamAuthoringSession").delete().lt("ExpiresAt", now.toISOString());

    const sessionToken = randomToken();
    const sessionHash = await sha256Hex(sessionToken);
    const { error: sessionError } = await admin.from("ExamAuthoringSession").insert({
      UserID: authData.user.id,
      TokenHash: sessionHash,
      ExpiresAt: expiresAt,
    });
    if (sessionError) return json(origin, { error: "ADMIN_SESSION_FAILED" }, 503);
    return json(origin, { data: { token: sessionToken, expires_at: expiresAt } });
  }

  const isAdmin = await verifyAdminSession(admin, authData.user.id, body.admin_token);
  if (!isAdmin) return json(origin, { error: "ADMIN_AUTH_REQUIRED" }, 401);

  if (body.action === "logout") {
    const tokenHash = await sha256Hex(String(body.admin_token));
    await admin.from("ExamAuthoringSession").delete().eq("TokenHash", tokenHash).eq("UserID", authData.user.id);
    return json(origin, { data: { success: true } });
  }

  if (body.action === "bootstrap") {
    const [{ data: subjects, error: subjectError }, { data: sets, error: setError }] = await Promise.all([
      admin.from("Subject").select("SubjectID,Subject").eq("Status", true).order("Subject"),
      admin.from("Category").select("CategoryID,Category,SubjectID,CreatedAt").eq("IsCustomSet", true).order("CreatedAt", { ascending: false }).limit(100),
    ]);
    if (subjectError || setError) return json(origin, { error: "ADMIN_DATA_UNAVAILABLE" }, 503);
    return json(origin, { data: { subjects: subjects ?? [], sets: sets ?? [] } });
  }

  if (body.action === "create_upload_url") {
    const mimeType = typeof body.mime_type === "string" ? body.mime_type.toLowerCase() : "";
    const fileSize = typeof body.file_size === "number" ? Math.trunc(body.file_size) : 0;
    const kind = body.kind === "choice" ? "choices" : body.kind === "question" ? "questions" : "";
    if (!kind || !ALLOWED_MIME_TYPES.has(mimeType)) return json(origin, { error: "INVALID_IMAGE_TYPE" }, 415);
    if (fileSize < 1 || fileSize > MAX_FILE_BYTES) return json(origin, { error: "IMAGE_TOO_LARGE" }, 413);

    const extension = MIME_EXTENSIONS[mimeType];
    const date = new Date();
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    const path = `${kind}/${yyyy}/${mm}/${crypto.randomUUID()}.${extension}`;
    const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (signedError || !signed?.token) return json(origin, { error: "UPLOAD_URL_FAILED" }, 503);
    const { data: publicData } = admin.storage.from(BUCKET).getPublicUrl(path);
    return json(origin, {
      data: {
        bucket: BUCKET,
        path,
        token: signed.token,
        public_url: publicData.publicUrl,
        max_bytes: MAX_FILE_BYTES,
      },
    });
  }

  if (body.action === "create_exam_set") {
    const validationError = validateExamPayload(body.subject_id, body.title, body.questions);
    if (validationError) return json(origin, { error: validationError }, 400);

    const { data, error } = await admin.rpc("create_exam_set_service", {
      p_subject_id: body.subject_id,
      p_title: String(body.title).trim(),
      p_questions: body.questions,
      p_created_by: authData.user.id,
    });
    if (error) {
      const message = error.message ?? "";
      const known = [
        "SET_TITLE_EXISTS",
        "SUBJECT_NOT_AVAILABLE",
        "INVALID_TITLE",
        "INVALID_QUESTIONS",
        "QUESTION_CONTENT_REQUIRED",
        "AT_LEAST_TWO_CHOICES_REQUIRED",
        "EXACTLY_ONE_CORRECT_CHOICE_REQUIRED",
        "CHOICE_CONTENT_REQUIRED",
      ].find((code) => message.includes(code));
      return json(origin, { error: known ?? "CREATE_EXAM_SET_FAILED" }, known ? 400 : 503);
    }
    return json(origin, { data });
  }

  return json(origin, { error: "UNKNOWN_ACTION" }, 400);
});
