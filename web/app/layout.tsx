import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hangar — launch Claude Code agents in the cloud",
  description:
    "Bring your own Claude key and spin up terminals running Claude Code to build your project.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
