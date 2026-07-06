"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type EnterpriseRow = {
  id: string;
  name: string;
  owner: { id: string; email: string; name: string | null } | null;
  planType: string | null;
  subscriptionStatus: string | null;
  membersCount: number;
  createdAt: string;
};

type ListResponse = {
  items: EnterpriseRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

const PLAN_TYPE_OPTIONS = [
  { value: "all", label: "All plans" },
  { value: "FREE", label: "Free" },
  { value: "CREATOR", label: "Creator" },
  { value: "ENTERPRISE", label: "Enterprise" },
];

const SUBSCRIPTION_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "none", label: "No subscription" },
  { value: "ACTIVE", label: "Active" },
  { value: "TRIALING", label: "Trialing" },
  { value: "PAST_DUE", label: "Past due" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "CANCELED", label: "Canceled" },
  { value: "PAUSED", label: "Paused" },
  { value: "INCOMPLETE", label: "Incomplete" },
  { value: "INCOMPLETE_EXPIRED", label: "Incomplete expired" },
];

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function statusBadgeClass(status: string | null): string {
  if (status === "ACTIVE" || status === "TRIALING") {
    return "bg-green-500/10 text-green-600 dark:text-green-400";
  }
  if (status === "PAST_DUE" || status === "UNPAID") {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

export default function AdminEnterprisesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [planType, setPlanType] = useState("all");
  const [subscriptionStatus, setSubscriptionStatus] = useState("all");
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

  function handlePlanTypeChange(value: string) {
    setPlanType(value);
    setPage(1);
  }

  function handleSubscriptionStatusChange(value: string) {
    setSubscriptionStatus(value);
    setPage(1);
  }

  // Fetch whenever any query param changes; setState only inside promise callbacks
  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      planType,
      subscriptionStatus,
    });
    if (debouncedSearch) qs.set("search", debouncedSearch);

    fetch(`/api/admin/enterprises?${qs}`)
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
          setError(
            e instanceof Error ? e.message : "Failed to load enterprises",
          );
      });

    return () => {
      cancelled = true;
    };
  }, [page, planType, subscriptionStatus, debouncedSearch]);

  const isInitialLoad = data === null && !error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Enterprises</h1>
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
                placeholder="Search name or owner email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
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
              value={subscriptionStatus}
              onChange={(e) => handleSubscriptionStatusChange(e.target.value)}
              aria-label="Filter by subscription status"
            >
              {SUBSCRIPTION_STATUS_OPTIONS.map((o) => (
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
                    Enterprise
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                    Owner
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden md:table-cell">
                    Plan
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Subscription
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                    Members
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden md:table-cell">
                    Created
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
                      colSpan={7}
                      className="px-6 py-10 text-center text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : data?.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-10 text-center text-muted-foreground"
                    >
                      No enterprises found.
                    </td>
                  </tr>
                ) : (
                  data?.items.map((enterprise) => (
                    <tr key={enterprise.id}>
                      <td className="px-6 py-3">
                        <Link
                          href={`/admin/enterprises/${enterprise.id}`}
                          className="font-medium hover:underline"
                        >
                          {enterprise.name}
                        </Link>
                      </td>
                      <td className="px-6 py-3 hidden sm:table-cell text-muted-foreground">
                        {enterprise.owner ? (
                          <>
                            <div>{enterprise.owner.name}</div>
                            <div>{enterprise.owner.email}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell text-muted-foreground">
                        {enterprise.planType ?? "—"}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(enterprise.subscriptionStatus)}`}
                        >
                          {enterprise.subscriptionStatus ?? "None"}
                        </span>
                      </td>
                      <td className="px-6 py-3 hidden sm:table-cell text-muted-foreground">
                        {enterprise.membersCount}
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell text-muted-foreground">
                        {new Date(enterprise.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button variant="ghost" size="xs" asChild>
                          <Link href={`/admin/enterprises/${enterprise.id}`}>
                            View
                          </Link>
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
