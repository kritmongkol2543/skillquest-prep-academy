import { supabase } from "@/lib/supabase";

export const ADMIN_SESSION_KEY = "skillquest-admin-token";
export const MAX_EXAM_IMAGE_BYTES = 5 * 1024 * 1024;

export type AdminSubject = {
  SubjectID: string;
  Subject: string;
};

export type AdminSetSummary = {
  CategoryID: string;
  Category: string;
  SubjectID: string;
  CreatedAt: string;
};

export type AdminBootstrap = {
  subjects: AdminSubject[];
  sets: AdminSetSummary[];
};

export type AdminExamChoicePayload = {
  text: string;
  image: string | null;
  correct: boolean;
};

export type AdminExamQuestionPayload = {
  question: string;
  image: string | null;
  level: string;
  explanation: string;
  choices: AdminExamChoicePayload[];
};

export type CreatedExamSet = {
  category_id: string;
  title: string;
  subject_id: string;
  subject: string;
  question_count: number;
  choice_count: number;
};

type AdminApiEnvelope<T> = {
  data?: T;
  error?: string;
};

async function ensureAdminAuthSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.access_token) return data.session;

  const signedIn = await supabase.auth.signInAnonymously();
  if (signedIn.error) throw signedIn.error;
  if (!signedIn.data.session?.access_token) throw new Error("AUTH_REQUIRED");
  return signedIn.data.session;
}

async function throwAdminInvokeError(error: unknown): Promise<never> {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: unknown };
        if (typeof payload.error === "string" && payload.error) {
          throw new Error(payload.error);
        }
      } catch (parseError) {
        if (parseError instanceof Error && !parseError.message.toLowerCase().includes("json")) {
          throw parseError;
        }
      }
    }
  }

  if (error instanceof Error) throw error;
  throw new Error("ADMIN_REQUEST_FAILED");
}

async function invokeAdmin<T>(body: Record<string, unknown>) {
  const session = await ensureAdminAuthSession();
  const { data, error } = await supabase.functions.invoke("skillquest-admin", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body,
  });
  if (error) await throwAdminInvokeError(error);
  const envelope = (data ?? {}) as AdminApiEnvelope<T>;
  if (envelope.error) throw new Error(envelope.error);
  if (envelope.data === undefined) throw new Error("ADMIN_RESPONSE_INVALID");
  return envelope.data;
}

export async function loginExamAdmin(code: string) {
  return invokeAdmin<{ token: string; expires_at: string }>({ action: "login", code });
}

export async function logoutExamAdmin(adminToken: string) {
  return invokeAdmin<{ success: boolean }>({ action: "logout", admin_token: adminToken });
}

export async function loadExamAdmin(adminToken: string) {
  return invokeAdmin<AdminBootstrap>({ action: "bootstrap", admin_token: adminToken });
}

function inferMimeType(file: File) {
  if (file.type) return file.type.toLowerCase();
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "";
}

export function validateExamImage(file: File) {
  const mimeType = inferMimeType(file);
  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (!allowed.has(mimeType)) throw new Error("รองรับเฉพาะ JPG, PNG, WEBP และ GIF");
  if (file.size > MAX_EXAM_IMAGE_BYTES) throw new Error("รูปต้องมีขนาดไม่เกิน 5MB");
  if (file.size < 1) throw new Error("ไฟล์รูปไม่ถูกต้อง");
  return mimeType;
}

export async function uploadExamImage(file: File, kind: "question" | "choice", adminToken: string) {
  const mimeType = validateExamImage(file);
  const signed = await invokeAdmin<{
    bucket: string;
    path: string;
    token: string;
    public_url: string;
    max_bytes: number;
  }>({
    action: "create_upload_url",
    admin_token: adminToken,
    kind,
    mime_type: mimeType,
    file_size: file.size,
  });

  const { error } = await supabase.storage
    .from(signed.bucket)
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: mimeType,
      cacheControl: "31536000",
    });
  if (error) throw error;
  return signed.public_url;
}

export async function createExamSet(
  adminToken: string,
  subjectId: string,
  title: string,
  questions: AdminExamQuestionPayload[],
) {
  return invokeAdmin<CreatedExamSet>({
    action: "create_exam_set",
    admin_token: adminToken,
    subject_id: subjectId,
    title,
    questions,
  });
}
