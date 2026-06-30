"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api, getToken, clearToken } from "@/lib/api";
import AuthScreen from "@/components/AuthScreen";
import Projects from "@/components/Projects";

const Workbench = dynamic(() => import("@/components/Workbench"), { ssr: false });

export default function Home() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [open, setOpen] = useState<{ id: string; key: string } | null>(null);

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    api
      .me()
      .then((d) => setUser(d.user))
      .catch(() => clearToken())
      .finally(() => setBooting(false));
  }, []);

  if (booting)
    return (
      <main className="hg-center">
        <p className="hangar-muted">Loading…</p>
      </main>
    );
  if (!user) return <AuthScreen onAuthed={setUser} />;
  if (open)
    return (
      <Workbench
        token={getToken() as string}
        projectId={open.id}
        claudeKey={open.key}
        onExit={() => setOpen(null)}
      />
    );
  return (
    <Projects
      user={user}
      onOpen={(id, key) => setOpen({ id, key })}
      onLogout={() => setUser(null)}
    />
  );
}
