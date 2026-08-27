"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ADMIN_SESSION_KEY,
  createExamSet,
  loadExamAdmin,
  loginExamAdmin,
  logoutExamAdmin,
  uploadExamImage,
  validateExamImage,
  type AdminBootstrap,
  type AdminExamQuestionPayload,
  type CreatedExamSet,
} from "@/lib/admin";
import "./admin.css";

type ChoiceDraft = {
  id: string;
  text: string;
  imageFile: File | null;
  imagePreview: string | null;
  correct: boolean;
};

type QuestionDraft = {
  id: string;
  question: string;
  imageFile: File | null;
  imagePreview: string | null;
  level: string;
  explanation: string;
  choices: ChoiceDraft[];
};

type BuilderStep = 1 | 2 | 3;
type AdminView = "home" | "create" | "success";

function uid() {
  return crypto.randomUUID();
}

function createChoice(): ChoiceDraft {
  return {
    id: uid(),
    text: "",
    imageFile: null,
    imagePreview: null,
    correct: false,
  };
}

function createQuestion(): QuestionDraft {
  return {
    id: uid(),
    question: "",
    imageFile: null,
    imagePreview: null,
    level: "ระดับข้อสอบ",
    explanation: "",
    choices: [createChoice(), createChoice(), createChoice(), createChoice()],
  };
}

function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    INVALID_ADMIN_CODE: "รหัสผู้ดูแลไม่ถูกต้อง",
    ADMIN_AUTH_REQUIRED: "Session ผู้ดูแลหมดอายุ กรุณาเข้าสู่ระบบใหม่",
    SET_TITLE_EXISTS: "มีชื่อชุดข้อสอบนี้อยู่ในวิชานี้แล้ว",
    SUBJECT_NOT_AVAILABLE: "วิชานี้ไม่พร้อมใช้งาน",
    INVALID_TITLE: "กรุณาตั้งชื่อชุดข้อสอบให้ถูกต้อง",
    QUESTION_CONTENT_REQUIRED: "ทุกข้อจำเป็นต้องมีข้อความคำถามหรือรูปคำถาม",
    AT_LEAST_TWO_CHOICES_REQUIRED: "แต่ละคำถามต้องมี Choice อย่างน้อย 2 ตัวเลือก",
    EXACTLY_ONE_CORRECT_CHOICE_REQUIRED: "แต่ละคำถามต้องเลือกคำตอบที่ถูกเพียง 1 Choice",
    CHOICE_CONTENT_REQUIRED: "Choice ทุกตัวต้องมีข้อความหรือรูปภาพ",
    IMAGE_TOO_LARGE: "รูปต้องมีขนาดไม่เกิน 5MB",
    INVALID_IMAGE_TYPE: "รองรับเฉพาะ JPG, PNG, WEBP และ GIF",
  };
  return messages[code] ?? code;
}

function revokePreview(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export default function ExamAuthoringPage() {
  const [adminToken, setAdminToken] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [bootstrap, setBootstrap] = useState<AdminBootstrap | null>(null);
  const [view, setView] = useState<AdminView>("home");
  const [step, setStep] = useState<BuilderStep>(1);
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([createQuestion()]);
  const [busy, setBusy] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [createdSet, setCreatedSet] = useState<CreatedExamSet | null>(null);

  const subjectMap = useMemo(
    () => new Map((bootstrap?.subjects ?? []).map((subject) => [subject.SubjectID, subject.Subject])),
    [bootstrap],
  );

  const selectedSubject = subjectMap.get(subjectId) ?? "";

  useEffect(() => {
    const saved = sessionStorage.getItem(ADMIN_SESSION_KEY) ?? "";
    if (!saved) {
      setLoadingAdmin(false);
      return;
    }
    setAdminToken(saved);
    loadExamAdmin(saved)
      .then((data) => setBootstrap(data))
      .catch(() => {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        setAdminToken("");
      })
      .finally(() => setLoadingAdmin(false));
  }, []);

  async function refreshAdmin(token = adminToken) {
    const data = await loadExamAdmin(token);
    setBootstrap(data);
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!loginCode.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      const session = await loginExamAdmin(loginCode.trim());
      sessionStorage.setItem(ADMIN_SESSION_KEY, session.token);
      setAdminToken(session.token);
      setLoginCode("");
      await refreshAdmin(session.token);
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
      setLoadingAdmin(false);
    }
  }

  async function handleLogout() {
    const token = adminToken;
    setAdminToken("");
    setBootstrap(null);
    setView("home");
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (token) void logoutExamAdmin(token).catch(() => undefined);
  }

  function resetBuilder() {
    questions.forEach((question) => {
      revokePreview(question.imagePreview);
      question.choices.forEach((choice) => revokePreview(choice.imagePreview));
    });
    setSubjectId("");
    setTitle("");
    setQuestions([createQuestion()]);
    setStep(1);
    setProgress(0);
    setMessage("");
    setCreatedSet(null);
  }

  function startBuilder() {
    resetBuilder();
    setView("create");
  }

  function updateQuestion(questionId: string, patch: Partial<QuestionDraft>) {
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, ...patch } : question));
  }

  function updateChoice(questionId: string, choiceId: string, patch: Partial<ChoiceDraft>) {
    setQuestions((current) => current.map((question) => {
      if (question.id !== questionId) return question;
      return {
        ...question,
        choices: question.choices.map((choice) => choice.id === choiceId ? { ...choice, ...patch } : choice),
      };
    }));
  }

  function setCorrectChoice(questionId: string, choiceId: string) {
    setQuestions((current) => current.map((question) => {
      if (question.id !== questionId) return question;
      return {
        ...question,
        choices: question.choices.map((choice) => ({ ...choice, correct: choice.id === choiceId })),
      };
    }));
  }

  function addChoice(questionId: string) {
    setQuestions((current) => current.map((question) => question.id === questionId
      ? { ...question, choices: [...question.choices, createChoice()] }
      : question));
  }

  function removeChoice(questionId: string, choiceId: string) {
    setQuestions((current) => current.map((question) => {
      if (question.id !== questionId || question.choices.length <= 2) return question;
      const removed = question.choices.find((choice) => choice.id === choiceId);
      revokePreview(removed?.imagePreview ?? null);
      return { ...question, choices: question.choices.filter((choice) => choice.id !== choiceId) };
    }));
  }

  function addQuestion() {
    setQuestions((current) => [...current, createQuestion()]);
  }

  function removeQuestion(questionId: string) {
    if (questions.length <= 1) return;
    const removed = questions.find((question) => question.id === questionId);
    if (removed) {
      revokePreview(removed.imagePreview);
      removed.choices.forEach((choice) => revokePreview(choice.imagePreview));
    }
    setQuestions((current) => current.filter((question) => question.id !== questionId));
  }

  function setQuestionImage(questionId: string, file: File | null) {
    if (!file) return;
    try {
      validateExamImage(file);
      setQuestions((current) => current.map((question) => {
        if (question.id !== questionId) return question;
        revokePreview(question.imagePreview);
        return { ...question, imageFile: file, imagePreview: URL.createObjectURL(file) };
      }));
      setMessage("");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  function clearQuestionImage(questionId: string) {
    setQuestions((current) => current.map((question) => {
      if (question.id !== questionId) return question;
      revokePreview(question.imagePreview);
      return { ...question, imageFile: null, imagePreview: null };
    }));
  }

  function setChoiceImage(questionId: string, choiceId: string, file: File | null) {
    if (!file) return;
    try {
      validateExamImage(file);
      setQuestions((current) => current.map((question) => {
        if (question.id !== questionId) return question;
        return {
          ...question,
          choices: question.choices.map((choice) => {
            if (choice.id !== choiceId) return choice;
            revokePreview(choice.imagePreview);
            return { ...choice, imageFile: file, imagePreview: URL.createObjectURL(file) };
          }),
        };
      }));
      setMessage("");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  function clearChoiceImage(questionId: string, choiceId: string) {
    setQuestions((current) => current.map((question) => {
      if (question.id !== questionId) return question;
      return {
        ...question,
        choices: question.choices.map((choice) => {
          if (choice.id !== choiceId) return choice;
          revokePreview(choice.imagePreview);
          return { ...choice, imageFile: null, imagePreview: null };
        }),
      };
    }));
  }

  function validateBuilder() {
    if (!subjectId) return "กรุณาเลือกวิชา";
    if (!title.trim()) return "กรุณาตั้งชื่อชุดข้อสอบ";
    for (let qIndex = 0; qIndex < questions.length; qIndex += 1) {
      const question = questions[qIndex];
      if (!question.question.trim() && !question.imageFile) return `ข้อ ${qIndex + 1}: กรุณาใส่คำถามหรือแนบรูป`;
      if (question.choices.length < 2) return `ข้อ ${qIndex + 1}: ต้องมี Choice อย่างน้อย 2 ตัวเลือก`;
      if (question.choices.filter((choice) => choice.correct).length !== 1) return `ข้อ ${qIndex + 1}: กรุณาติ๊ก Choice ที่ถูก 1 ข้อ`;
      for (let cIndex = 0; cIndex < question.choices.length; cIndex += 1) {
        const choice = question.choices[cIndex];
        if (!choice.text.trim() && !choice.imageFile) return `ข้อ ${qIndex + 1} Choice ${cIndex + 1}: กรุณาใส่ข้อความหรือรูป`;
      }
    }
    return "";
  }

  async function saveExamSet() {
    const validation = validateBuilder();
    if (validation) {
      setMessage(validation);
      return;
    }

    setBusy(true);
    setMessage("");
    setProgress(2);
    try {
      const totalFiles = questions.reduce((sum, question) => (
        sum + (question.imageFile ? 1 : 0) + question.choices.filter((choice) => choice.imageFile).length
      ), 0);
      let uploadedFiles = 0;

      const payload: AdminExamQuestionPayload[] = [];
      for (const question of questions) {
        let questionImage: string | null = null;
        if (question.imageFile) {
          questionImage = await uploadExamImage(question.imageFile, "question", adminToken);
          uploadedFiles += 1;
          setProgress(totalFiles ? Math.round((uploadedFiles / (totalFiles + 1)) * 88) : 20);
        }

        const choices = [];
        for (const choice of question.choices) {
          let choiceImage: string | null = null;
          if (choice.imageFile) {
            choiceImage = await uploadExamImage(choice.imageFile, "choice", adminToken);
            uploadedFiles += 1;
            setProgress(totalFiles ? Math.round((uploadedFiles / (totalFiles + 1)) * 88) : 20);
          }
          choices.push({ text: choice.text.trim(), image: choiceImage, correct: choice.correct });
        }

        payload.push({
          question: question.question.trim(),
          image: questionImage,
          level: question.level.trim() || "ระดับข้อสอบ",
          explanation: question.explanation.trim(),
          choices,
        });
      }

      setProgress(92);
      const created = await createExamSet(adminToken, subjectId, title.trim(), payload);
      setCreatedSet(created);
      setProgress(100);
      await refreshAdmin();
      setView("success");
    } catch (error) {
      const text = friendlyError(error);
      setMessage(text);
      if (text.includes("Session ผู้ดูแล")) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        setAdminToken("");
        setBootstrap(null);
      }
    } finally {
      setBusy(false);
    }
  }

  if (loadingAdmin) {
    return <main className="admin-loading"><div className="admin-loader"/><p>กำลังตรวจสอบสิทธิ์ผู้ดูแล</p></main>;
  }

  if (!adminToken || !bootstrap) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <a className="admin-back-link" href="../">← กลับหน้าทำข้อสอบ</a>
          <div className="admin-auth-mark">SQ</div>
          <p className="admin-kicker">EXAM AUTHORING</p>
          <h1>ระบบสร้างข้อสอบ</h1>
          <p className="admin-auth-copy">พื้นที่สำหรับเพิ่มชุดข้อสอบ คำถาม Choice และรูปประกอบเข้าสู่คลังข้อสอบโดยตรง</p>
          <form onSubmit={handleLogin}>
            <label>
              <span>Admin access code</span>
              <input
                autoFocus
                type="password"
                autoComplete="current-password"
                value={loginCode}
                onChange={(event) => setLoginCode(event.target.value)}
                placeholder="กรอกรหัสผู้ดูแล"
              />
            </label>
            {message && <div className="admin-error">{message}</div>}
            <button className="admin-primary admin-full" type="submit" disabled={busy || !loginCode.trim()}>
              {busy ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบสร้างข้อสอบ"}
            </button>
          </form>
          <small>รูปคำถามและ Choice รองรับ JPG, PNG, WEBP, GIF สูงสุด 5MB ต่อรูป</small>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a href="../" className="admin-brand">
          <span>SQ</span>
          <div><b>SkillQuest</b><small>EXAM AUTHORING</small></div>
        </a>
        <nav>
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>คลังข้อสอบ</button>
          <button className={view === "create" ? "active" : ""} onClick={startBuilder}>สร้างข้อสอบ</button>
        </nav>
        <div className="admin-side-info">
          <span>Image limit</span>
          <b>5MB / file</b>
          <small>JPG · PNG · WEBP · GIF</small>
        </div>
        <button className="admin-logout" onClick={handleLogout}>ออกจากระบบผู้ดูแล</button>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div>
            <span>SkillQuest Admin</span>
            <b>{view === "create" ? "Exam Builder" : view === "success" ? "Saved" : "Question Bank"}</b>
          </div>
          <a href="../">เปิดหน้าทำข้อสอบ ↗</a>
        </header>

        {view === "home" && (
          <div className="admin-page">
            <div className="admin-page-head">
              <div>
                <p className="admin-kicker">QUESTION BANK</p>
                <h1>จัดการชุดข้อสอบ</h1>
                <span>สร้างชุดใหม่ตามวิชา แล้วเพิ่มคำถามและ Choice ได้ตามจำนวนที่ต้องการ</span>
              </div>
              <button className="admin-primary" onClick={startBuilder}>＋ สร้างข้อสอบ</button>
            </div>

            <section className="admin-stat-grid">
              <article><span>วิชาที่เปิดใช้งาน</span><b>{bootstrap.subjects.length}</b><small>ดึงจาก Subject master</small></article>
              <article><span>ชุดที่สร้างผ่านระบบนี้</span><b>{bootstrap.sets.length}</b><small>Custom exam sets</small></article>
              <article><span>Choice ต่อคำถาม</span><b>Dynamic</b><small>ขั้นต่ำ 2 · ไม่ล็อกที่ 4/5 ตัวเลือก</small></article>
              <article><span>รูปประกอบ</span><b>5MB</b><small>รองรับทั้งคำถามและ Choice</small></article>
            </section>

            <section className="admin-panel">
              <div className="admin-panel-head">
                <div><h2>ชุดข้อสอบที่สร้างล่าสุด</h2><p>รายการที่ถูกสร้างจาก Exam Builder</p></div>
                <button className="admin-secondary" onClick={() => void refreshAdmin()}>รีเฟรช</button>
              </div>
              {bootstrap.sets.length ? (
                <div className="admin-set-list">
                  {bootstrap.sets.slice(0, 12).map((set) => (
                    <article key={set.CategoryID}>
                      <div className="admin-set-subject">{subjectMap.get(set.SubjectID)?.slice(0, 2) ?? "SQ"}</div>
                      <div><b>{set.Category}</b><span>{subjectMap.get(set.SubjectID) ?? "ไม่ทราบวิชา"}</span></div>
                      <time>{new Date(set.CreatedAt).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })}</time>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="admin-empty">
                  <b>ยังไม่มีชุดข้อสอบที่สร้างผ่านระบบนี้</b>
                  <span>กด “สร้างข้อสอบ” เพื่อเริ่มชุดแรก</span>
                </div>
              )}
            </section>
          </div>
        )}

        {view === "create" && (
          <div className="admin-page admin-builder-page">
            <div className="admin-page-head compact">
              <div>
                <p className="admin-kicker">NEW EXAM SET</p>
                <h1>สร้างชุดข้อสอบใหม่</h1>
                <span>{step === 1 ? "เลือกวิชา" : step === 2 ? "ตั้งชื่อชุดข้อสอบ" : `${selectedSubject} · ${title}`}</span>
              </div>
              <button className="admin-secondary" onClick={() => setView("home")} disabled={busy}>ยกเลิก</button>
            </div>

            <div className="admin-stepper">
              {[1, 2, 3].map((item) => (
                <div key={item} className={`${step === item ? "active" : ""} ${step > item ? "done" : ""}`}>
                  <i>{step > item ? "✓" : item}</i>
                  <span>{item === 1 ? "เลือกวิชา" : item === 2 ? "ชื่อชุดข้อสอบ" : "คำถามและคำตอบ"}</span>
                </div>
              ))}
            </div>

            {message && <div className="admin-error admin-builder-error">{message}</div>}

            {step === 1 && (
              <section className="admin-panel admin-step-panel">
                <div className="admin-step-heading"><span>STEP 01</span><h2>เลือกวิชา</h2><p>ชุดข้อสอบจะถูกจัดเก็บอยู่ภายใต้วิชาที่เลือก</p></div>
                <div className="admin-subject-grid">
                  {bootstrap.subjects.map((subject) => (
                    <button
                      key={subject.SubjectID}
                      className={subjectId === subject.SubjectID ? "selected" : ""}
                      onClick={() => setSubjectId(subject.SubjectID)}
                    >
                      <i>{subject.Subject.slice(0, 1)}</i>
                      <b>{subject.Subject}</b>
                      <span>{subjectId === subject.SubjectID ? "เลือกแล้ว" : "เลือกวิชานี้"}</span>
                    </button>
                  ))}
                </div>
                <div className="admin-step-actions"><span/><button className="admin-primary" disabled={!subjectId} onClick={() => setStep(2)}>ถัดไป — ตั้งชื่อชุด</button></div>
              </section>
            )}

            {step === 2 && (
              <section className="admin-panel admin-step-panel admin-title-step">
                <div className="admin-step-heading"><span>STEP 02</span><h2>ตั้งชื่อชุดข้อสอบ</h2><p>ชื่อชุดจะใช้แยกชุดข้อสอบภายในวิชา {selectedSubject}</p></div>
                <label className="admin-title-field">
                  <span>ชื่อชุดข้อสอบ</span>
                  <input
                    autoFocus
                    maxLength={120}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="เช่น ชุดเก็งข้อสอบเตรียมทหาร 01"
                  />
                  <small>{title.length}/120 ตัวอักษร</small>
                </label>
                <div className="admin-step-actions">
                  <button className="admin-secondary" onClick={() => setStep(1)}>← ย้อนกลับ</button>
                  <button className="admin-primary" disabled={!title.trim()} onClick={() => setStep(3)}>เริ่มสร้างคำถาม</button>
                </div>
              </section>
            )}

            {step === 3 && (
              <div className="admin-question-builder">
                <div className="admin-builder-summary">
                  <div><span>วิชา</span><b>{selectedSubject}</b></div>
                  <div><span>ชุดข้อสอบ</span><b>{title}</b></div>
                  <div><span>จำนวนคำถาม</span><b>{questions.length} ข้อ</b></div>
                  <div><span>Choice ทั้งหมด</span><b>{questions.reduce((sum, question) => sum + question.choices.length, 0)} ตัวเลือก</b></div>
                </div>

                {questions.map((question, questionIndex) => (
                  <section className="admin-question-card" key={question.id}>
                    <header>
                      <div><span>QUESTION</span><b>{String(questionIndex + 1).padStart(2, "0")}</b></div>
                      <button onClick={() => removeQuestion(question.id)} disabled={questions.length <= 1 || busy}>ลบคำถาม</button>
                    </header>

                    <div className="admin-question-body">
                      <label className="admin-field">
                        <span>คำถาม</span>
                        <textarea
                          rows={3}
                          value={question.question}
                          onChange={(event) => updateQuestion(question.id, { question: event.target.value })}
                          placeholder="พิมพ์โจทย์หรือคำถาม..."
                        />
                      </label>

                      <div className="admin-image-row">
                        <div>
                          <b>รูปประกอบคำถาม</b>
                          <span>ไม่บังคับ · สูงสุด 5MB</span>
                        </div>
                        {question.imagePreview ? (
                          <div className="admin-image-preview question-image">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={question.imagePreview} alt={`ตัวอย่างรูปคำถาม ${questionIndex + 1}`} />
                            <button onClick={() => clearQuestionImage(question.id)} type="button">ลบรูป</button>
                          </div>
                        ) : (
                          <label className="admin-upload-button">
                            ＋ แนบรูป
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                              onChange={(event) => setQuestionImage(question.id, event.target.files?.[0] ?? null)}
                            />
                          </label>
                        )}
                      </div>

                      <div className="admin-choice-section">
                        <div className="admin-choice-head">
                          <div><b>Choice</b><span>ติ๊กวงกลมหน้าข้อที่ถูก · เพิ่ม Choice ได้ตามต้องการ</span></div>
                          <span>{question.choices.length} ตัวเลือก</span>
                        </div>

                        <div className="admin-choice-list">
                          {question.choices.map((choice, choiceIndex) => (
                            <article className={choice.correct ? "correct" : ""} key={choice.id}>
                              <label className="admin-correct-radio" title="ตั้งเป็นคำตอบที่ถูก">
                                <input
                                  type="radio"
                                  name={`correct-${question.id}`}
                                  checked={choice.correct}
                                  onChange={() => setCorrectChoice(question.id, choice.id)}
                                />
                                <i/>
                              </label>
                              <div className="admin-choice-index">{String.fromCharCode(65 + (choiceIndex % 26))}{choiceIndex >= 26 ? choiceIndex + 1 : ""}</div>
                              <input
                                className="admin-choice-input"
                                value={choice.text}
                                onChange={(event) => updateChoice(question.id, choice.id, { text: event.target.value })}
                                placeholder={`Choice ${choiceIndex + 1}`}
                              />
                              {choice.imagePreview ? (
                                <div className="admin-choice-image">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={choice.imagePreview} alt={`รูป Choice ${choiceIndex + 1}`} />
                                  <button type="button" onClick={() => clearChoiceImage(question.id, choice.id)}>×</button>
                                </div>
                              ) : (
                                <label className="admin-choice-upload" title="แนบรูป Choice">
                                  รูป
                                  <input
                                    type="file"
                                    accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                                    onChange={(event) => setChoiceImage(question.id, choice.id, event.target.files?.[0] ?? null)}
                                  />
                                </label>
                              )}
                              <button
                                type="button"
                                className="admin-choice-remove"
                                onClick={() => removeChoice(question.id, choice.id)}
                                disabled={question.choices.length <= 2 || busy}
                                title="ลบ Choice"
                              >×</button>
                            </article>
                          ))}
                        </div>
                        <button className="admin-add-choice" type="button" onClick={() => addChoice(question.id)} disabled={busy}>＋ เพิ่ม Choice</button>
                      </div>

                      <div className="admin-question-meta">
                        <label className="admin-field">
                          <span>ระดับ / Tag</span>
                          <input value={question.level} onChange={(event) => updateQuestion(question.id, { level: event.target.value })} placeholder="ระดับข้อสอบ" />
                        </label>
                        <label className="admin-field">
                          <span>คำอธิบายเฉลย <em>Optional</em></span>
                          <textarea rows={2} value={question.explanation} onChange={(event) => updateQuestion(question.id, { explanation: event.target.value })} placeholder="อธิบายเหตุผลของคำตอบที่ถูก..." />
                        </label>
                      </div>
                    </div>
                  </section>
                ))}

                <button className="admin-add-question" type="button" onClick={addQuestion} disabled={busy}>
                  <span>＋</span><div><b>เพิ่มคำถามใหม่</b><small>เพิ่ม Question พร้อม Choice ชุดใหม่</small></div>
                </button>

                <div className="admin-save-bar">
                  <button className="admin-secondary" disabled={busy} onClick={() => setStep(2)}>← แก้ชื่อชุด</button>
                  <div>
                    {busy && <div className="admin-progress"><i style={{ width: `${progress}%` }}/><span>{progress}%</span></div>}
                    <button className="admin-primary admin-save" disabled={busy} onClick={() => void saveExamSet()}>
                      {busy ? "กำลังบันทึกชุดข้อสอบ..." : `บันทึกชุดข้อสอบ · ${questions.length} ข้อ`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === "success" && createdSet && (
          <div className="admin-page admin-success-page">
            <section className="admin-success-card">
              <div className="admin-success-mark">✓</div>
              <p className="admin-kicker">SAVED TO QUESTION BANK</p>
              <h1>สร้างชุดข้อสอบเรียบร้อย</h1>
              <p><b>{createdSet.subject}</b> · {createdSet.title}</p>
              <div className="admin-success-stats">
                <div><span>Questions</span><b>{createdSet.question_count}</b></div>
                <div><span>Choices</span><b>{createdSet.choice_count}</b></div>
                <div><span>Images</span><b>Supabase Storage</b></div>
              </div>
              <div className="admin-success-actions">
                <button className="admin-secondary" onClick={() => setView("home")}>กลับคลังข้อสอบ</button>
                <button className="admin-primary" onClick={startBuilder}>＋ สร้างชุดใหม่</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
