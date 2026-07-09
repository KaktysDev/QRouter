import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QCI OpenRouter — Unified Quantum Compute Routing",
  description:
    "Authenticate once, deposit compute credits, and route quantum workloads to any supported QPU or GPU-simulated backend with a single click.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-obsidian text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
