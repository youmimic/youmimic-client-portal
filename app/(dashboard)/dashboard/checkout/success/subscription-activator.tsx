"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SubscriptionActivator() {
  const { update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const raw = searchParams.get("redirect") ?? "/dashboard";
    // Prevent open redirect: only allow paths within /dashboard.
    const target = raw.startsWith("/dashboard") ? raw : "/dashboard";
    update().then(() => router.replace(target));
  }, [update, router, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Activating your subscription…</p>
    </div>
  );
}
