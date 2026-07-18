import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.110.2";

const ALLOWED_ORIGIN = "https://skillquest-player-hub.kritmongkol2543.chatgpt.site";
const ALLOWED_HOSTS = new Set([
  "quiz.engineer-tutor.com",
  "pttsjpmwvppkaacgzdqh.supabase.co",
  "www.trueplookpanya.com",
  "trueplookpanya.com",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (origin === ALLOWED_ORIGIN) return true;
  if (/^https:\/\/[a-z0-9-]+\.github\.io$/.test(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function headers(origin: string | null, extra: HeadersInit = {}) {
  return {
    "Access-Control-Allow-Origin": origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
    ...extra,
  };
}

function response(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers(origin, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }),
  });
}

async function getImageUrl(admin: ReturnType<typeof createClient>, kind: string, id: string) {
  if (kind === "question") {
    const { data, error } = await admin.from("Question").select("ImageLink").eq("QuestionID", id).maybeSingle();
    if (error) throw error;
    return typeof data?.ImageLink === "string" ? data.ImageLink : null;
  }
  if (kind === "answer") {
    const { data, error } = await admin.from("Answer").select("Image").eq("AnswerID", id).maybeSingle();
    if (error) throw error;
    return typeof data?.Image === "string" ? data.Image : null;
  }
  return null;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return response(origin, { error: "ORIGIN_NOT_ALLOWED" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin) });
  if (request.method !== "GET") return response(origin, { error: "METHOD_NOT_ALLOWED" }, 405);

  const requestUrl = new URL(request.url);
  const kind = requestUrl.searchParams.get("kind") ?? "";
  const id = requestUrl.searchParams.get("id") ?? "";
  if (!["question", "answer"].includes(kind) || !UUID_RE.test(id)) {
    return response(origin, { error: "INVALID_IMAGE_REQUEST" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return response(origin, { error: "SERVICE_UNAVAILABLE" }, 503);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const imageUrl = await getImageUrl(admin, kind, id);
  if (!imageUrl) return response(origin, { error: "IMAGE_NOT_FOUND" }, 404);

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(imageUrl);
  } catch {
    return response(origin, { error: "INVALID_IMAGE_URL" }, 400);
  }
  if (!["http:", "https:"].includes(upstreamUrl.protocol) || !ALLOWED_HOSTS.has(upstreamUrl.hostname)) {
    return response(origin, { error: "IMAGE_HOST_NOT_ALLOWED" }, 403);
  }

  const upstream = await fetch(upstreamUrl, {
    headers: {
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "SkillQuest-ImageProxy/1.0",
    },
  });
  if (!upstream.ok || !upstream.body) {
    return response(origin, { error: "IMAGE_UNAVAILABLE" }, upstream.status === 404 ? 404 : 502);
  }

  const contentType = upstream.headers.get("Content-Type") ?? "application/octet-stream";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return response(origin, { error: "NOT_AN_IMAGE" }, 415);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: headers(origin, {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800",
      "X-Content-Type-Options": "nosniff",
    }),
  });
});
