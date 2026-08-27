"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ADMIN_SESSION_KEY,
  loadExamAdmin,
  loadExamSetForEdit,
  updateExamSet,
  uploadExamImage,
  validateExamImage,
  type AdminBootstrap,
  type AdminExamQuestionPayload,
  type UpdatedExamSet,
} from "@/lib/admin";
import "../admin.css";

type ChoiceDraft = {
  id: string;
  text: string;
  existingImage: string | null;
  imageFile: File | null;
  imagePreview: string | null;
  correct: boolean;
};

type QuestionDraft = {
  id: string;
  question: string;
  existingImage: string | null;
  imageFile: File | null;
  imagePreview: string | null;
  level: string;
  explanation: string;
  choices: ChoiceDraft[];
};

function uid() {
  return crypto.randomUUID();
}

function createChoice(): ChoiceDraft {
  return {
    id: uid(),
    text: "",
    existingImage: null,
    imageFile: null,
    imagePreview: null,
    correct: false,
  };
}

function createQuestion(): QuestionDraft {
  return {
    id: uid(),
    question: "",
    existingImage: null,
    imageFile: null,
    imagePreview: null,
    level: "ระดับข้อสอบ",
    explanation: "",
    choices: [createChoice(), createChoice(), createChoice(), createChoice()],
  };
}

function revokePreview(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function friendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    ADMIN_AUTH_REQUIRED: "Session ผู้ดูแลหมดอายุ กรุณากลับไปเข้าสู่ระบบใหม่",
    EDIT_SET_NOT_AVAILABLE: "ไม่พบชุดข้อสอบนี้ หรือชุดนี้ไม่ได้สร้างผ่าน Exam Builder",
    EDIT_SET_SUPERSEDED: "ชุดนี้มี Revision ใหม่แล้ว กรุณารีเฟรชและเลือกชุดล่าสุด",
    SET_TITLE_EXISTS: "มีชื่อชุดข้อสอบนี้อยู่ในวิชาที่เลือกแล้ว",
    SUBJECT_NOT_AVAILABLE: "วิชานี้ไม่พร้อมใช้งาน",
    INVALID_TITLE: "กรุณาตั้งชื่อชุดข้อสอบให้ถูกต้อง",
    QUESTION_CONTENT_REQUIRED: "ทุกข้อต้องมีข้อความคำถามหรือรูปคำถาม",
    AT_LEAST_TWO_CHOICES_REQUIRED: "แต่ละคำถามต้องมี Choice อย่างน้อย 2 ตัวเลือก",
    EXACTLY_ONE_CORRECT_CHOICE_REQUIRED: "แต่ละคำถามต้องมีคำตอบถูกเพียง 1 Choice",
    CHOICE_CONTENT_REQUIRED: "Choice ทุกตัวต้องมีข้อความหรือรูปภาพ",
    IMAGE_TOO_LARGE: "รูปต้องมีขนาดไม่เกิน 5MB",
    INVALID_IMAGE_TYPE: "รองรับเฉพาะ JPG, PNG, WEBP และ GIF",
    PAYLOAD_TOO_LARGE: "ข้อมูลชุดข้อสอบมีขนาดใหญ่เกินไป กรุณาลดข้อความหรือจำนวนข้อในชุดนี้",
  };
  return messages[code] ?? code;
}

export default function ExamEditPage() {
  const [adminToken, setAdminToken] = useState("");
  const [bootstrap, setBootstrap] = useState<AdminBootstrap | null>(null);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [sourceSetId, setSourceSetId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSet, setLoadingSet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [saved, setSaved] = useState<UpdatedExamSet | null>(null);

  const subjectMap = useMemo(
    () => new Map((bootstrap?.subjects ?? []).map((subject) => [subject.SubjectID, subject.Subject])),
    [bootstrap],
  );

  useEffect(() => {
    const token = sessionStorage.getItem(ADMIN_SESSION_KEY) ?? "";
    if (!token) {
      setLoading(false);
      return;
    }
    setAdminToken(token);
    loadExamAdmin(token)
      .then((data) => setBootstrap(data))
      .catch((error) => setMessage(friendlyError(error)))
      .finally(() => setLoading(false));
  }, []);

  function cleanupDrafts() {
    questions.forEach((question) => {
      revokePreview(question.imagePreview);
      question.choices.forEach((choice) => revokePreview(choice.imagePreview));
    });
  }

  async function refreshAdmin(token = adminToken) {
    const data = await loadExamAdmin(token);
    setBootstrap(data);
    return data;
  }

  async function openSet(categoryId: string) {
    if (!categoryId || !adminToken) return;
    cleanupDrafts();
    setSelectedSetId(categoryId);
    setLoadingSet(true);
    setMessage("");
    setSaved(null);
    try {
      const data = await loadExamSetForEdit(adminToken, categoryId);
      setSourceSetId(data.category_id);
      setSubjectId(data.subject_id);
      setTitle(data.title);
      setQuestions(data.questions.map((question) => ({
        id: question.question_id || uid(),
        question: question.question ?? "",
        existingImage: question.image,
        imageFile: null,
        imagePreview: question.image,
        level: question.level || "ระดับข้อสอบ",
        explanation: question.explanation ?? "",
        choices: question.choices.map((choice) => ({
          id: choice.answer_id || uid(),
          text: choice.text ?? "",
          existingImage: choice.image,
          imageFile: null,
          imagePreview: choice.image,
          correct: choice.correct === true,
        })),
      })));
    } catch (error) {
      setSourceSetId("");
      setQuestions([]);
      setMessage(friendlyError(error));
    } finally {
      setLoadingSet(false);
    }
  }

  function updateQuestion(questionId: string, patch: Partial<QuestionDraft>) {
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, ...patch } : question));
  }

  function updateChoice(questionId: string, choiceId: string, patch: Partial<ChoiceDraft>) {
    setQuestions((current) => current.map((question) => question.id === questionId ? {
      ...question,
      choices: question.choices.map((choice) => choice.id === choiceId ? { ...choice, ...patch } : choice),
    } : question));
  }

  function setCorrectChoice(questionId: string, choiceId: string) {
    setQuestions((current) => current.map((question) => question.id === questionId ? {
      ...question,
      choices: question.choices.map((choice) => ({ ...choice, correct: choice.id === choiceId })),
    } : question));
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

  function setQuestionImage(questionId: string, file: File | null) {
    if (!file) return;
    try {
      validateExamImage(file);
      setQuestions((current) => current.map((question) => {
        if (question.id !== questionId) return question;
        revokePreview(question.imagePreview);
        return {
          ...question,
          existingImage: null,
          imageFile: file,
          imagePreview: URL.createObjectURL(file),
        };
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
      return { ...question, existingImage: null, imageFile: null, imagePreview: null };
    }));
  }

  function setChoiceImage(questionId: string, choiceId: string, file: File | null) {
    if (!file) return;
    try {
      validateExamImage(file);
      setQuestions((current) => current.map((question) => question.id === questionId ? {
        ...question,
        choices: question.choices.map((choice) => {
          if (choice.id !== choiceId) return choice;
          revokePreview(choice.imagePreview);
          return {
            ...choice,
            existingImage: null,
            imageFile: file,
            imagePreview: URL.createObjectURL(file),
          };
        }),
      } : question));
      setMessage("");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  function clearChoiceImage(questionId: string, choiceId: string) {
    setQuestions((current) => current.map((question) => question.id === questionId ? {
      ...question,
      choices: question.choices.map((choice) => {
        if (choice.id !== choiceId) return choice;
        revokePreview(choice.imagePreview);
        return { ...choice, existingImage: null, imageFile: null, imagePreview: null };
      }),
    } : question));
  }

  function validateBuilder() {
    if (!sourceSetId) return "กรุณาเลือกชุดข้อสอบที่ต้องการแก้ไข";
    if (!subjectId) return "กรุณาเลือกวิชา";
    if (!title.trim()) return "กรุณาระบุชื่อชุดข้อสอบ";
    if (!questions.length) return "ชุดข้อสอบต้องมีอย่างน้อย 1 คำถาม";

    for (let qIndex = 0; qIndex < questions.length; qIndex += 1) {
      const question = questions[qIndex];
      if (!question.question.trim() && !question.imageFile && !question.existingImage) {
        return `ข้อ ${qIndex + 1}: กรุณาใส่คำถามหรือแนบรูป`;
      }
      if (question.choices.length < 2) return `ข้อ ${qIndex + 1}: ต้องมี Choice อย่างน้อย 2 ตัวเลือก`;
      if (question.choices.filter((choice) => choice.correct).length !== 1) {
        return `ข้อ ${qIndex + 1}: กรุณาติ๊ก Choice ที่ถูก 1 ข้อ`;
      }
      for (let cIndex = 0; cIndex < question.choices.length; cIndex += 1) {
        const choice = question.choices[cIndex];
        if (!choice.text.trim() && !choice.imageFile && !choice.existingImage) {
          return `ข้อ ${qIndex + 1} Choice ${cIndex + 1}: กรุณาใส่ข้อความหรือรูป`;
        }
      }
    }
    return "";
  }

  async function saveChanges() {
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
        let questionImage = question.existingImage;
        if (question.imageFile) {
          questionImage = await uploadExamImage(question.imageFile, "question", adminToken);
          uploadedFiles += 1;
          setProgress(totalFiles ? Math.round((uploadedFiles / (totalFiles + 1)) * 88) : 20);
        }

        const choices = [];
        for (const choice of question.choices) {
          let choiceImage = choice.existingImage;
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
      const result = await updateExamSet(adminToken, sourceSetId, subjectId, title.trim(), payload);
      setSaved(result);
      setProgress(100);
      const refreshed = await refreshAdmin();
      setSelectedSetId(result.category_id);
      setSourceSetId(result.category_id);
      const latest = refreshed.sets.find((item) => item.CategoryID === result.category_id);
      if (latest) {
        setTitle(latest.Category);
        setSubjectId(latest.SubjectID);
      }
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="admin-loading"><div className="admin-loader"/><p>กำลังเปิด Exam Editor</p></main>;
  }

  if (!adminToken || !bootstrap) {
    return (
      <main className="admin-auth-shell">
        <section className="admin-auth-card">
          <div className="admin-auth-mark">SQ</div>
          <p className="admin-kicker">EXAM EDITOR</p>
          <h1>กรุณาเข้าสู่ระบบ Admin ก่อน</h1>
          <p className="admin-auth-copy">หน้าแก้ไขใช้ Session เดียวกับระบบสร้างข้อสอบ เพื่อแยกสิทธิ์ออกจากหน้าเล่นข้อสอบ</p>
          {message && <div className="admin-error">{message}</div>}
          <a className="admin-primary admin-full" href="../" style={{ display: "grid", placeItems: "center", textDecoration: "none" }}>ไปหน้า Admin Login</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a href="../" className="admin-brand">
          <span>SQ</span>
          <div><b>SkillQuest</b><small>EXAM EDITOR</small></div>
        </a>
        <nav>
          <a href="../" style={{ color: "inherit", textDecoration: "none" }}>คลัง / สร้างข้อสอบ</a>
          <button className="active">แก้ไขข้อสอบ</button>
        </nav>
        <div className="admin-side-info">
          <span>Safe edit mode</span>
          <b>Revision-based</b>
          <small>ไม่เขียนทับข้อสอบที่เคยถูกทำแล้ว</small>
        </div>
      </aside>

      <section className="admin-workspace">
        <header className="admin-topbar">
          <div><span>SkillQuest Admin</span><b>Exam Editor</b></div>
          <a href="../">กลับคลังข้อสอบ</a>
        </header>

        <div className="admin-page admin-builder-page">
          <div className="admin-page-head">
            <div>
              <p className="admin-kicker">VERSION-SAFE EDIT</p>
              <h1>แก้ไขชุดข้อสอบ</h1>
              <span>เมื่อบันทึก ระบบจะสร้าง Revision ใหม่ ส่วนชุดเดิมจะเก็บไว้เพื่อรักษาประวัติและผู้ที่กำลังทำข้อสอบ</span>
            </div>
            <button className="admin-secondary" onClick={() => void refreshAdmin()} disabled={busy}>รีเฟรชรายการ</button>
          </div>

          {message && <div className="admin-error admin-builder-error">{message}</div>}
          {saved && (
            <div className="admin-error admin-builder-error" style={{ background: "#edf8f2", borderColor: "#b9dfca", color: "#256447" }}>
              บันทึก Revision ใหม่เรียบร้อย · {saved.subject} · {saved.title} · {saved.question_count} ข้อ
            </div>
          )}

          <section className="admin-panel" style={{ marginBottom: 24 }}>
            <div className="admin-panel-head">
              <div><h2>เลือกชุดข้อสอบ</h2><p>แสดงเฉพาะ Custom set เวอร์ชันล่าสุดที่เปิดใช้งาน</p></div>
              <b>{bootstrap.sets.length} ชุด</b>
            </div>
            {bootstrap.sets.length ? (
              <div className="admin-set-list">
                {bootstrap.sets.map((set) => (
                  <article key={set.CategoryID} style={{ outline: selectedSetId === set.CategoryID ? "2px solid #28745a" : undefined, outlineOffset: -2 }}>
                    <div className="admin-set-subject">{subjectMap.get(set.SubjectID)?.slice(0, 2) ?? "SQ"}</div>
                    <div><b>{set.Category}</b><span>{subjectMap.get(set.SubjectID) ?? "ไม่ทราบวิชา"}</span></div>
                    <time>{new Date(set.CreatedAt).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" })}</time>
                    <button className="admin-secondary" disabled={loadingSet || busy} onClick={() => void openSet(set.CategoryID)}>
                      {loadingSet && selectedSetId === set.CategoryID ? "กำลังเปิด..." : "แก้ไข"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="admin-empty"><b>ยังไม่มีชุดข้อสอบที่แก้ไขได้</b><span>สร้างชุดข้อสอบจาก Exam Builder ก่อน</span></div>
            )}
          </section>

          {sourceSetId && questions.length > 0 && (
            <div className="admin-question-builder">
              <section className="admin-panel admin-step-panel" style={{ marginBottom: 20 }}>
                <div className="admin-step-heading"><span>SETTINGS</span><h2>ข้อมูลชุดข้อสอบ</h2><p>สามารถเปลี่ยนวิชา ชื่อชุด และเนื้อหาทั้งชุดได้</p></div>
                <div className="admin-subject-grid">
                  {bootstrap.subjects.map((subject) => (
                    <button key={subject.SubjectID} className={subjectId === subject.SubjectID ? "selected" : ""} onClick={() => setSubjectId(subject.SubjectID)} disabled={busy}>
                      <i>{subject.Subject.slice(0, 1)}</i>
                      <b>{subject.Subject}</b>
                      <span>{subjectId === subject.SubjectID ? "เลือกแล้ว" : "เลือกวิชานี้"}</span>
                    </button>
                  ))}
                </div>
                <label className="admin-title-field" style={{ marginTop: 20 }}>
                  <span>ชื่อชุดข้อสอบ</span>
                  <input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} disabled={busy} />
                  <small>{title.length}/120 ตัวอักษร</small>
                </label>
              </section>

              <div className="admin-builder-summary">
                <div><span>วิชา</span><b>{subjectMap.get(subjectId) ?? "—"}</b></div>
                <div><span>ชุดข้อสอบ</span><b>{title || "—"}</b></div>
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
                      <textarea rows={3} value={question.question} onChange={(event) => updateQuestion(question.id, { question: event.target.value })} disabled={busy} />
                    </label>

                    <div className="admin-image-row">
                      <div><b>รูปประกอบคำถาม</b><span>ของเดิมจะถูกเก็บไว้จนกว่าจะลบหรือเปลี่ยน</span></div>
                      {question.imagePreview ? (
                        <div className="admin-image-preview question-image">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={question.imagePreview} alt={`รูปคำถาม ${questionIndex + 1}`} />
                          <button onClick={() => clearQuestionImage(question.id)} type="button" disabled={busy}>ลบรูป</button>
                        </div>
                      ) : (
                        <label className="admin-upload-button">＋ แนบรูป
                          <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setQuestionImage(question.id, event.target.files?.[0] ?? null)} disabled={busy} />
                        </label>
                      )}
                    </div>

                    <div className="admin-choice-section">
                      <div className="admin-choice-head">
                        <div><b>Choice</b><span>แก้ข้อความ รูป เพิ่ม/ลบ Choice และเปลี่ยนข้อที่ถูกได้</span></div>
                        <span>{question.choices.length} ตัวเลือก</span>
                      </div>
                      <div className="admin-choice-list">
                        {question.choices.map((choice, choiceIndex) => (
                          <article className={choice.correct ? "correct" : ""} key={choice.id}>
                            <label className="admin-correct-radio" title="ตั้งเป็นคำตอบที่ถูก">
                              <input type="radio" name={`edit-correct-${question.id}`} checked={choice.correct} onChange={() => setCorrectChoice(question.id, choice.id)} disabled={busy} />
                              <i/>
                            </label>
                            <div className="admin-choice-index">{String.fromCharCode(65 + (choiceIndex % 26))}{choiceIndex >= 26 ? choiceIndex + 1 : ""}</div>
                            <input className="admin-choice-input" value={choice.text} onChange={(event) => updateChoice(question.id, choice.id, { text: event.target.value })} disabled={busy} />
                            {choice.imagePreview ? (
                              <div className="admin-choice-image">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={choice.imagePreview} alt={`รูป Choice ${choiceIndex + 1}`} />
                                <button type="button" onClick={() => clearChoiceImage(question.id, choice.id)} disabled={busy}>×</button>
                              </div>
                            ) : (
                              <label className="admin-choice-upload" title="แนบรูป Choice">รูป
                                <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setChoiceImage(question.id, choice.id, event.target.files?.[0] ?? null)} disabled={busy} />
                              </label>
                            )}
                            <button type="button" className="admin-choice-remove" onClick={() => removeChoice(question.id, choice.id)} disabled={question.choices.length <= 2 || busy}>×</button>
                          </article>
                        ))}
                      </div>
                      <button className="admin-add-choice" type="button" onClick={() => addChoice(question.id)} disabled={busy}>＋ เพิ่ม Choice</button>
                    </div>

                    <div className="admin-question-meta">
                      <label className="admin-field">
                        <span>ระดับ / Tag</span>
                        <input value={question.level} onChange={(event) => updateQuestion(question.id, { level: event.target.value })} disabled={busy} />
                      </label>
                      <label className="admin-field">
                        <span>คำอธิบายเฉลย <em>Optional</em></span>
                        <textarea rows={2} value={question.explanation} onChange={(event) => updateQuestion(question.id, { explanation: event.target.value })} disabled={busy} />
                      </label>
                    </div>
                  </div>
                </section>
              ))}

              <button className="admin-add-question" type="button" onClick={addQuestion} disabled={busy}>
                <span>＋</span><div><b>เพิ่มคำถามใหม่</b><small>เพิ่ม Question พร้อม Choice ชุดใหม่</small></div>
              </button>

              <div className="admin-save-bar">
                <div style={{ color: "#667386", fontSize: 12, maxWidth: 560 }}>
                  การบันทึกจะไม่แก้หรือลบ Revision เดิม เพื่อให้ผลสอบเก่าและ Session ที่กำลังทำอยู่คงเดิม
                </div>
                <div>
                  {busy && <div className="admin-progress"><i style={{ width: `${progress}%` }}/><span>{progress}%</span></div>}
                  <button className="admin-primary admin-save" disabled={busy} onClick={() => void saveChanges()}>
                    {busy ? "กำลังสร้าง Revision ใหม่..." : `บันทึกการแก้ไข · ${questions.length} ข้อ`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
