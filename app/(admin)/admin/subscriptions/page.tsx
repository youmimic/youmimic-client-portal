"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PlanBadge, StatusBadge } from "@/components/billing/status-badges";

type SubscriptionRow = {
  id: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string;
  planType: string;
  status: string;
  ownerType: string;
  ownerDisplay: string | null;
  ownerEmail: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
};

type ListResponse = {
  items: SubscriptionRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "TRIALING", label: "Trialing" },
  { value: "PAST_DUE", label: "Past due" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "INCOMPLETE", label: "Incomplete" },
  { value: "INCOMPLETE_EXPIRED", label: "Incomplete expired" },
  { value: "CANCELED", label: "Canceled" },
  { value: "PAUSED", label: "Paused" },
];

const PLAN_TYPE_OPTIONS = [
  { value: "all", label: "All plans" },
  { value: "FREE", label: "Free" },
  { value: "CREATOR", label: "Creator" },
  { value: "ENTERPRISE", label: "Enterprise" },
];

const OWNER_TYPE_OPTIONS = [
  { value: "all", label: "All owner types" },
  { value: "USER", label: "User-owned" },
  { value: "ENTERPRISE", label: "Enterprise-owned" },
];

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export default function AdminSubscriptionsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [planType, setPlanType] = useState("all");
  const [ownerType, setOwnerType] = useState("all");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounce search input; page reset is inside the setTimeout callback (not synchronous)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  function handleStatusChange(value: string) {
    setStatus(value);
    setPage(1);
  }

  function handlePlanTypeChange(value: string) {
    setPlanType(value);
    setPage(1);
  }

  function handleOwnerTypeChange(value: string) {
    setOwnerType(value);
    setPage(1);
  }

  // Fetch whenever any query param changes; setState only inside promise callbacks
  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      status,
      planType,
      ownerType,
    });
    if (debouncedSearch) qs.set("search", debouncedSearch);

    fetch(`/api/admin/subscriptions?${qs}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<ListResponse>;
      })
      .then((result) => {
        if (!cancelled) {
          setError(null);
          setData(result);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load subscriptions");
      });

    return () => {
      cancelled = true;
    };
  }, [page, status, planType, ownerType, debouncedSearch]);

  const isInitialLoad = data === null && !error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Subscriptions</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data ? `${data.totalItems.toLocaleString()} total` : "Loading…"}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                placeholder="Search subscription ID, customer ID, or owner email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className={SELECT_CLASS}
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              aria-label="Filter by status"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className={SELECT_CLASS}
              value={planType}
              onChange={(e) => handlePlanTypeChange(e.target.value)}
              aria-label="Filter by plan type"
            >
              {PLAN_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className={SELECT_CLASS}
              value={ownerType}
              onChange={(e) => handleOwnerTypeChange(e.target.value)}
              aria-label="Filter by owner type"
            >
              {OWNER_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0 pt-4">
          {error && (
            <p className="px-6 pb-4 text-sm text-destructive">{error}</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Owner
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                    Plan
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden md:table-cell">
                    Stripe subscription
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                    Period ends
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground sr-only">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isInitialLoad ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : data?.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-muted-foreground"
                    >
                      No subscriptions found.
                    </td>
                  </tr>
                ) : (
                  data?.items.map((sub) => (
                    <tr key={sub.id}>
                      <td className="px-6 py-3">
                        <Link href={`/admin/subscriptions/${sub.id}`}>
                          <div className="font-medium">
                            {sub.ownerDisplay ?? "—"}
                          </div>
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {sub.ownerEmail ?? "—"}
                          {" · "}
                          {sub.ownerType === "ENTERPRISE" ? "Enterprise" : "User"}
                        </div>
                      </td>
                      <td className="px-6 py-3 hidden sm:table-cell">
                        <PlanBadge plan={sub.planType} />
                      </td>
                      <td className="px-6 py-3">
                        <StatusBadge status={sub.status} />
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell">
                        <div className="font-mono text-xs">
                          {sub.stripeSubscriptionId ?? "—"}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {sub.stripeCustomerId}
                        </div>
                      </td>
                      <td className="px-6 py-3 hidden lg:table-cell text-muted-foreground">
                        {sub.currentPeriodEnd
                          ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button variant="ghost" size="xs" asChild>
                          <Link href={`/admin/subscriptions/${sub.id}`}>View</Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-6 py-3">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
