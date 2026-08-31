"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SYSTEM_EVENT_LABEL, type SystemEventType } from "@/lib/stripe/system-event-types";

type ActivityRow = {
  id: string;
  type: string;
  source: string;
  message: string;
  metadata: unknown;
  userName: string | null;
  userEmail: string | null;
  enterpriseName: string | null;
  createdAt: string;
};

type ListResponse = {
  items: ActivityRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

const TYPE_OPTIONS = [
  { value: "all", label: "All events" },
  ...Object.entries(SYSTEM_EVENT_LABEL).map(([value, label]) => ({
    value,
    label,
  })),
];

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

function eventLabel(type: string): string {
  return SYSTEM_EVENT_LABEL[type as SystemEventType] ?? type;
}

export default function AdminActivityPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState("all");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  function handleTypeChange(value: string) {
    setType(value);
    setPage(1);
  }

  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      type,
    });
    if (debouncedSearch) qs.set("search", debouncedSearch);

    fetch(`/api/admin/activity?${qs}`)
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
          setError(e instanceof Error ? e.message : "Failed to load activity");
      });

    return () => {
      cancelled = true;
    };
  }, [page, type, debouncedSearch]);

  const isInitialLoad = data === null && !error;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data
            ? `${data.totalItems.toLocaleString()} total`
            : "Loading…"}
          {" · "}
          Billing events recorded from Stripe webhooks.
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
                placeholder="Search message, customer email, or client name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className={SELECT_CLASS}
              value={type}
              onChange={(e) => handleTypeChange(e.target.value)}
              aria-label="Filter by event type"
            >
              {TYPE_OPTIONS.map((o) => (
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
                    Event
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">
                    Message
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                    Who
                  </th>
                  <th className="px-6 py-3 font-medium text-muted-foreground hidden md:table-cell">
                    When
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isInitialLoad ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-10 text-center text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                ) : data?.items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-10 text-center text-muted-foreground"
                    >
                      No activity found.
                    </td>
                  </tr>
                ) : (
                  data?.items.map((event) => (
                    <tr key={event.id}>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                          {eventLabel(event.type)}
                        </span>
                      </td>
                      <td className="px-6 py-3 max-w-md">{event.message}</td>
                      <td className="px-6 py-3 hidden sm:table-cell">
                        <div className="font-medium">
                          {event.enterpriseName ?? event.userName ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {event.userEmail ?? "—"}
                        </div>
                      </td>
                      <td className="px-6 py-3 hidden md:table-cell text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
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
