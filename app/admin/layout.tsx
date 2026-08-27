import Link from "next/link";

export default function AdminAreaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      {children}
      <nav
        aria-label="Exam authoring shortcuts"
        style={{
          position: "fixed",
          right: 16,
          top: 82,
          zIndex: 80,
          display: "flex",
          gap: 8,
          padding: 6,
          border: "1px solid #dfe4e9",
          borderRadius: 12,
          background: "rgba(255,255,255,.94)",
          boxShadow: "0 10px 28px rgba(20,40,63,.12)",
          backdropFilter: "blur(12px)",
        }}
      >
        <Link
          href="/admin/"
          style={{ padding: "8px 11px", borderRadius: 8, color: "#14283f", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
        >
          คลัง / สร้าง
        </Link>
        <Link
          href="/admin/edit/"
          style={{ padding: "8px 11px", borderRadius: 8, background: "#14283f", color: "#fff", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
        >
          แก้ไขข้อสอบ
        </Link>
      </nav>
    </>
  );
}
