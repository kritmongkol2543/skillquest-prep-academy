import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillQuest — เตรียมพร้อมทุกสนามสอบ",
  description: "ฝึกทำข้อสอบ ติดตามพัฒนาการ และวางแผนเตรียมสอบเข้าโรงเรียนเตรียมทหารอย่างเป็นระบบ",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "SkillQuest — เตรียมพร้อมทุกสนามสอบ",
    description: "ฝึกทำข้อสอบและติดตามพัฒนาการอย่างเป็นระบบ",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "SkillQuest — เตรียมพร้อมทุกสนามสอบ" },
};

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Exam images are supplied through admin-managed Question/Answer URLs.
  // Keep scripts and connections locked down, but permit those external image origins.
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self' https://pttsjpmwvppkaacgzdqh.supabase.co wss://pttsjpmwvppkaacgzdqh.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const owner = process.env.GITHUB_REPOSITORY?.split("/")[0] ?? "";
const isUserSite = repository.toLowerCase() === `${owner.toLowerCase()}.github.io`;
const basePath = process.env.GITHUB_ACTIONS === "true" && repository && !isUserSite ? `/${repository}` : "";

const authoringStyles = `
  .global-authoring-entry {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 120;
    min-height: 42px;
    padding: 0 15px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255,255,255,.18);
    border-radius: 10px;
    background: #14283f;
    color: #fff;
    box-shadow: 0 12px 30px rgba(20,40,63,.22);
    font-size: 11px;
    font-weight: 750;
    text-decoration: none;
    transition: transform 160ms ease, background 160ms ease;
  }
  .global-authoring-entry:hover { transform: translateY(-1px); background: #203a57; }
  body:has(.admin-shell) .global-authoring-entry,
  body:has(.admin-auth-shell) .global-authoring-entry,
  body:has(.admin-loading) .global-authoring-entry { display: none; }
  @media (max-width: 640px) {
    .global-authoring-entry { right: 12px; bottom: 12px; min-height: 38px; padding: 0 12px; font-size: 10px; }
  }
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <head>
        <meta httpEquiv="Content-Security-Policy" content={csp}/>
        <meta name="referrer" content="strict-origin-when-cross-origin"/>
        <style>{authoringStyles}</style>
      </head>
      <body>
        {children}
        <a className="global-authoring-entry" href={`${basePath}/admin/`}>＋ สร้างข้อสอบ</a>
      </body>
    </html>
  );
}
