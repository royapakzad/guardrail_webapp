import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guardrails Demo — Mozilla.ai Workshop",
  description: "Interactive demo: agentic vs non-agentic guardrails across domains",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
