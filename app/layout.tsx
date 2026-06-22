import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Guardrails Demo — Contextual Evaluation of LLM Guardrails Across Languages and Agentic Systems",
  description: "Contextual Evaluation of LLM Guardrails Across Languages and Agentic Systems",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
