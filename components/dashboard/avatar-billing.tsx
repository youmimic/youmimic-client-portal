"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

async function apiCall(url: string, method: string) {
  const res = await fetch(url, { method });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

export type AvatarBillingRow = {
  id: string;
  name: string;
  billingStatus: "ACTIVE" | "PAUSED" | "ARCHIVED";
  subscription: {
    unitAmountCents: number | null;
    currency: string;
    currentPeriodEnd: string | null;
    provisioningFailedAt: string | null;
    provisioningFailureMsg: string | null;
  } | null;
};

function includedInTotal(avatar: AvatarBillingRow): boolean {
  const sub = avatar.subscription;
  if (!sub || sub.unitAmountCents === null) return false;
  if (avatar.billingStatus === "ACTIVE") return true;
  return !!sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) >= new Date();
}

// Read-only itemized breakdown for every enterprise (Phase 1), with
// self-serve Add/Remove actions layered in for SELF_SERVE enterprises
// (Phase 2). SALES_ASSISTED enterprises never see the actions — billing
// changes for those go through the YouMimic team, same as Phase 1.
export function AvatarBillingBreakdown({
  enterpriseId,
  provisioningMode,
  platformFee,
  avatars,
}: {
  enterpriseId: string;
  provisioningMode: "SALES_ASSISTED" | "SELF_SERVE";
  platformFee: { unitAmountCents: number | null; currency: string } | null;
  avatars: AvatarBillingRow[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<{ id: string; message: string } | null>(null);

  const selfServe = provisioningMode === "SELF_SERVE";
  const currency = platformFee?.currency ?? avatars[0]?.subscription?.currency ?? "AUD";
  const totalCents =
    (platformFee?.unitAmountCents ?? 0) +
    avatars.reduce((sum, a) => {
      if (!includedInTotal(a) || a.subscription?.unitAmountCents == null) return sum;
      return sum + a.subscription.unitAmountCents;
    }, 0);

  async function handleAdd(avatarId: string) {
    setPendingId(avatarId);
    setErrorFor(null);
    try {
      await apiCall(`/api/dashboard/enterprises/${enterpriseId}/avatars/${avatarId}/storage-subscription`, "POST");
      router.refresh();
    } catch (e) {
      setErrorFor({ id: avatarId, message: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setPendingId(null);
    }
  }

  async function handleRemove(avatarId: string) {
    setPendingId(avatarId);
    setErrorFor(null);
    try {
      await apiCall(`/api/dashboard/enterprises/${enterpriseId}/avatars/${avatarId}/storage-subscription`, "DELETE");
      router.refresh();
    } catch (e) {
      setErrorFor({ id: avatarId, message: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="rounded-md border text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
        <span className="font-medium">Platform Access Fee</span>
        <span className="tabular-nums">
          {platformFee?.unitAmountCents !== null && platformFee?.unitAmountCents !== undefined
            ? formatAmount(platformFee.unitAmountCents, currency)
            : "—"}
        </span>
      </div>
      {avatars.map((avatar) => {
        const included = includedInTotal(avatar);
        const hasSub = !!avatar.subscription;
        const failed = avatar.subscription?.provisioningFailedAt;
        return (
          <div key={avatar.id} className="border-b last:border-b-0">
            <div className="flex items-center justify-between px-3 py-2 gap-3">
              <span>
                {avatar.name}
                {avatar.billingStatus !== "ACTIVE" && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({avatar.billingStatus === "PAUSED" ? "paused" : "archived"}
                    {included ? ", billed through current period" : ""})
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="tabular-nums text-muted-foreground">
                  {avatar.subscription?.unitAmountCents !== null && avatar.subscription?.unitAmountCents !== undefined
                    ? formatAmount(avatar.subscription.unitAmountCents, avatar.subscription.currency)
                    : "—"}
                </span>
                {selfServe && (
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={pendingId === avatar.id}
                    onClick={() => (hasSub ? handleRemove(avatar.id) : handleAdd(avatar.id))}
                  >
                    {pendingId === avatar.id ? "…" : hasSub ? "Remove" : "Add avatar"}
                  </Button>
                )}
              </div>
            </div>
            {failed && (
              <p className="px-3 pb-2 text-xs text-destructive">
                Billing setup failed: {avatar.subscription?.provisioningFailureMsg ?? "Unknown error"}. We&apos;ll retry automatically.
              </p>
            )}
            {errorFor?.id === avatar.id && (
              <p className="px-3 pb-2 text-xs text-destructive">{errorFor.message}</p>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between px-3 py-2 font-semibold">
        <span>Total / month</span>
        <span className="tabular-nums">{formatAmount(totalCents, currency)}</span>
      </div>
      {!selfServe && avatars.length > 0 && (
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          Contact your account manager to change avatars on this plan.
        </p>
      )}
    </div>
  );
}
