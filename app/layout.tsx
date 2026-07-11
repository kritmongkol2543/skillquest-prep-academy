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
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' https://pttsjpmwvppkaacgzdqh.supabase.co wss://pttsjpmwvppkaacgzdqh.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><head><meta httpEquiv="Content-Security-Policy" content={csp}/><meta name="referrer" content="strict-origin-when-cross-origin"/></head><body>{children}</body></html>;
}
