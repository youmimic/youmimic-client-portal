"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SubscriptionActivator() {
  const { update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activated = useRef(false);

  useEffect(() => {
    if (activated.current) return;
    activated.current = true;

    const raw = searchParams.get("redirect") ?? "/dashboard";
    const target = raw.startsWith("/dashboard") ? raw : "/dashboard";
    // Best-effort refresh: always redirect even if update() rejects (e.g. network
    // error, direct URL visit). The API layer enforces subscription state via a
    // fresh DB check on every booking request regardless of JWT state.
    update()
      .then(() => router.replace(target))
      .catch(() => router.replace(target));
  }, [update, router, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Activating your subscription…</p>
    </div>
  );
}
