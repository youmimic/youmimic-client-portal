"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";

type Membership = {
  enterprise: { id: string; name: string };
  role: { name: string };
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  adminRole: string | null;
  isSuspended: boolean;
  createdAt: string;
  enterpriseMembers?: Membership[];
};

type ListResponse = {
  users: UserRow[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
};

type UserTypeTab = "all" | "admin" | "enterprise";

const USER_TYPE_TABS: { value: UserTypeTab; label: string }[] = [
  { value: "all", label: "All Users" },
  { value: "admin", label: "Admin" },
  { value: "enterprise", label: "Enterprise User" },
];

const ADMIN_ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
  { value: "ADMIN", label: "Admin" },
  { value: "BILLING_ADMIN", label: "Billing Admin" },
];

// Matches the Role rows EnterpriseMember actually points at ("owner" /
// "member") — see lib/validations/admin.ts, not a Prisma enum.
const ENTERPRISE_ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "owner", label: "Owner" },
  { value: "member", label: "Member" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "false", label: "Active" },
  { value: "true", label: "Suspended" },
];

const SELECT_CLASS =
  "h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [userType, setUserType] = useState<UserTypeTab>("all");
  const [adminRole, setAdminRole] = useState("all");
  const [enterpriseRole, setEnterpriseRole] = useState("all");
  const [isSuspended, setIsSuspended] = useState("all");
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

  function handleUserTypeChange(value: unknown) {
    setUserType(value as UserTypeTab);
    // Each tab has its own role dropdown — switching tabs clears both so a
    // stale "Owner" filter can't silently carry over into the Admin tab.
    setAdminRole("all");
    setEnterpriseRole("all");
    setPage(1);
  }

  function handleAdminRoleChange(value: string) {
    setAdminRole(value);
    setPage(1);
  }

  function handleEnterpriseRoleChange(value: string) {
    setEnterpriseRole(value);
    setPage(1);
  }

  function handleSuspendedChange(value: string) {
    setIsSuspended(value);
    setPage(1);
  }

  // Fetch whenever any query param changes; setState only inside promise callbacks
  useEffect(() => {
    let cancelled = false;

    const qs = new URLSearchParams({
      page: String(page),
      pageSize: "20",
      userType,
      adminRole,
      enterpriseRole,
      isSuspended,
    });
    if (debouncedSearch) qs.set("search", debouncedSearch);

    fetch(`/api/admin/users?${qs}`)
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
          setError(e instanceof Error ? e.message : "Failed to load users");
      });

    return () => {
      cancelled = true;
    };
  }, [page, userType, adminRole, enterpriseRole, isSuspended, debouncedSearch]);

  const isInitialLoad = data === null && !error;
  const showCompanyColumn = userType === "enterprise";
  const columnCount = showCompanyColumn ? 6 : 5;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {data
            ? `${data.pagination.total.toLocaleString()} total`
            : "Loading…"}
        </p>
      </div>

      <Tabs value={userType} onValueChange={handleUserTypeChange}>
        <TabsList>
          {USER_TYPE_TABS.map((tab) => (
            <TabsTab key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTab>
          ))}
        </TabsList>

        {/* One panel, always bound to whichever tab is currently active —
            the three tabs share one filtered table, not three distinct
            contents, so a panel per tab would just triplicate this JSX. */}
        <TabsPanel value={userType}>
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
                      placeholder="Search name or email…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {userType === "admin" && (
                    <select
                      className={SELECT_CLASS}
                      value={adminRole}
                      onChange={(e) => handleAdminRoleChange(e.target.value)}
                      aria-label="Filter by admin role"
                    >
                      {ADMIN_ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {userType === "enterprise" && (
                    <select
                      className={SELECT_CLASS}
                      value={enterpriseRole}
                      onChange={(e) => handleEnterpriseRoleChange(e.target.value)}
                      aria-label="Filter by enterprise role"
                    >
                      {ENTERPRISE_ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    className={SELECT_CLASS}
                    value={isSuspended}
                    onChange={(e) => handleSuspendedChange(e.target.value)}
                    aria-label="Filter by status"
                  >
                    {STATUS_OPTIONS.map((o) => (
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
                          User
                        </th>
                        {showCompanyColumn && (
                          <th className="px-6 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                            Company
                          </th>
                        )}
                        <th className="px-6 py-3 font-medium text-muted-foreground hidden sm:table-cell">
                          Admin Role
                        </th>
                        <th className="px-6 py-3 font-medium text-muted-foreground">
                          Status
                        </th>
                        <th className="px-6 py-3 font-medium text-muted-foreground hidden md:table-cell">
                          Joined
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
                            colSpan={columnCount}
                            className="px-6 py-10 text-center text-muted-foreground"
                          >
                            Loading…
                          </td>
                        </tr>
                      ) : data?.users.length === 0 ? (
                        <tr>
                          <td
                            colSpan={columnCount}
                            className="px-6 py-10 text-center text-muted-foreground"
                          >
                            No users found.
                          </td>
                        </tr>
                      ) : (
                        data?.users.map((user) => (
                          <tr key={user.id}>
                            <td className="px-6 py-3">
                              <Link href={`/admin/users/${user.id}`}>
                                <div className="font-medium">{user.name}</div>
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {user.email}
                              </div>
                            </td>
                            {showCompanyColumn && (
                              <td className="px-6 py-3 hidden sm:table-cell">
                                {user.enterpriseMembers && user.enterpriseMembers.length > 0 ? (
                                  <div className="flex flex-col gap-1">
                                    {user.enterpriseMembers.map((m) => (
                                      <div key={m.enterprise.id}>
                                        <Link
                                          href={`/admin/enterprises/${m.enterprise.id}`}
                                          className="font-medium hover:underline"
                                        >
                                          {m.enterprise.name}
                                        </Link>
                                        <span className="text-xs text-muted-foreground">
                                          {" "}
                                          · {m.role.name}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            )}
                            <td className="px-6 py-3 hidden sm:table-cell">
                              {user.adminRole ? (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                  {user.adminRole.replace(/_/g, " ")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-6 py-3">
                              {user.isSuspended ? (
                                <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                  Suspended
                                </span>
                              ) : (
                                <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-3 hidden md:table-cell text-muted-foreground">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-3 text-right">
                              <Button variant="ghost" size="xs" asChild>
                                <Link href={`/admin/users/${user.id}`}>View</Link>
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {data && data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between border-t px-6 py-3">
                    <p className="text-sm text-muted-foreground">
                      Page {data.pagination.page} of {data.pagination.totalPages}
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
                        disabled={page >= data.pagination.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
        </TabsPanel>
      </Tabs>
    </div>
  );
}
