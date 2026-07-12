import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import type { AdminRole } from "@/app/generated/prisma/client";
import { canViewBookings } from "@/lib/admin/rbac";
import { ENTITY_TYPES } from "@/lib/admin/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CAPITAL_CITY_LABELS,
  type AustralianCapitalCity,
} from "@/lib/validations/booking";

export const dynamic = "force-dynamic";

function DetailRow({
  label,
  value,
  mono = false,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span
        className={`break-all text-right ${mono ? "font-mono text-xs" : ""} ${valueClass ?? ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function formatLocation(booking: {
  captureLocationType: string | null;
  capitalCity: string | null;
  suburbOrTown: string | null;
  stateOrTerritory: string | null;
  postcode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  locationNotes: string | null;
}): string {
  if (!booking.captureLocationType) return "—";
  if (booking.captureLocationType === "capital_city") {
    const city = booking.capitalCity as AustralianCapitalCity | null;
    return city ? (CAPITAL_CITY_LABELS[city] ?? city) : "Capital city";
  }
  if (booking.captureLocationType === "regional_other") {
    const parts = [
      booking.addressLine1,
      booking.addressLine2,
      booking.suburbOrTown,
      booking.stateOrTerritory,
      booking.postcode,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Regional";
  }
  if (booking.captureLocationType === "multi_location") {
    return booking.locationNotes ?? "Multi-location";
  }
  return "—";
}

export default async function AdminBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.adminRole) redirect("/dashboard");

  const actorRole = session.user.adminRole as AdminRole;
  if (!canViewBookings(actorRole)) redirect("/dashboard");

  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      requestedDate: true,
      timeStart: true,
      timeEnd: true,
      capturesCount: true,
      status: true,
      paymentStatus: true,
      notes: true,
      captureLocationType: true,
      capitalCity: true,
      suburbOrTown: true,
      stateOrTerritory: true,
      postcode: true,
      addressLine1: true,
      addressLine2: true,
      locationNotes: true,
      createdAt: true,
      userId: true,
      enterpriseId: true,
      user: { select: { id: true, name: true, email: true } },
      enterprise: { select: { id: true, name: true } },
      participants: {
        select: { id: true, sortOrder: true, firstName: true, contactNumber: true },
        orderBy: { sortOrder: "asc" },
      },
      payments: {
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          stripeInvoiceId: true,
          stripePaymentIntentId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!booking) notFound();

  // Booking has no direct Subscription relation in the current schema —
  // Subscription links to a User or an Enterprise, not a Booking. Show the
  // most recent subscription for whichever owns this booking as read-only
  // context (same "most recent row" pattern used for enterprise plan/status).
  const subscription = booking.enterpriseId
    ? await prisma.subscription.findFirst({
        where: { enterpriseId: booking.enterpriseId },
        select: { planType: true, status: true },
        orderBy: { createdAt: "desc" },
      })
    : await prisma.subscription.findFirst({
        where: { userId: booking.userId },
        select: { planType: true, status: true },
        orderBy: { createdAt: "desc" },
      });

  // No booking mutation routes exist yet (Phase B1 is read-only), so no
  // AdminLog row has ever been written with entityType: ENTITY_TYPES.BOOKING.
  // Wired up ahead of Phase B2 — will be empty until a mutation route calls
  // writeAuditLog with this entityType.
  const auditLog = await prisma.adminLog.findMany({
    where: { entityType: ENTITY_TYPES.BOOKING, entityId: booking.id },
    select: {
      id: true,
      action: true,
      reason: true,
      createdAt: true,
      adminUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 20,
  });

  const bookingLabel = new Date(booking.requestedDate).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav
        className="flex items-center gap-1 text-sm text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <Link href="/admin" className="hover:text-foreground transition-colors">
          Admin
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <Link
          href="/admin/bookings"
          className="hover:text-foreground transition-colors"
        >
          Bookings
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-foreground font-medium">{bookingLabel}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">{bookingLabel}</h1>
        <p className="text-sm text-muted-foreground">
          {booking.timeStart}–{booking.timeEnd} · {booking.capturesCount}{" "}
          {booking.capturesCount === 1 ? "capture" : "captures"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Booking Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <DetailRow label="Booking ID" value={booking.id} mono />
            <DetailRow
              label="Status"
              value={booking.status}
              valueClass={
                booking.status === "confirmed" || booking.status === "completed"
                  ? "font-medium text-green-600 dark:text-green-400 capitalize"
                  : booking.status === "cancelled"
                    ? "font-medium text-destructive capitalize"
                    : "capitalize"
              }
            />
            <DetailRow
              label="Payment Status"
              value={booking.paymentStatus}
              valueClass={
                booking.paymentStatus === "paid"
                  ? "font-medium text-green-600 dark:text-green-400 capitalize"
                  : booking.paymentStatus === "failed"
                    ? "font-medium text-destructive capitalize"
                    : "capitalize"
              }
            />
            <DetailRow label="Location" value={formatLocation(booking)} />
            <DetailRow
              label="Notes"
              value={booking.notes ?? "—"}
            />
            <DetailRow
              label="Created"
              value={booking.createdAt.toLocaleDateString("en-AU", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            />
          </CardContent>
        </Card>

        {/* Requester + Enterprise */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requester</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {booking.user ? (
              <>
                <DetailRow label="Name" value={booking.user.name} />
                <DetailRow label="Email" value={booking.user.email} />
                <DetailRow label="User ID" value={booking.user.id} mono />
              </>
            ) : (
              <p className="text-muted-foreground">No user on record.</p>
            )}
            <DetailRow
              label="Enterprise"
              value={booking.enterprise?.name ?? "Personal booking"}
            />
            <DetailRow
              label="Subscription Plan"
              value={subscription?.planType ?? "None"}
            />
            <DetailRow
              label="Subscription Status"
              value={subscription?.status ?? "None"}
            />
          </CardContent>
        </Card>
      </div>

      {/* Participants */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Participants</CardTitle>
        </CardHeader>
        <CardContent>
          {booking.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No participants recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">#</th>
                    <th className="pb-2 font-medium text-muted-foreground">
                      First Name
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground">
                      Contact Number
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {booking.participants.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-4 text-muted-foreground">{p.sortOrder}</td>
                      <td className="py-2 pr-4">{p.firstName}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {p.contactNumber}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {booking.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payment records linked to this booking.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground">Amount</th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                      Stripe Invoice
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {booking.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-4 capitalize">{p.status}</td>
                      <td className="py-2 pr-4">
                        {(p.amount / 100).toLocaleString(undefined, {
                          style: "currency",
                          currency: p.currency.toUpperCase(),
                        })}
                      </td>
                      <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground font-mono text-xs">
                        {p.stripeInvoiceId ?? "—"}
                      </td>
                      <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                        {p.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Log</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No admin actions recorded for this booking. Booking mutations are not
              yet implemented (Phase B1 is read-only) — this section is wired up
              ahead of Phase B2.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Action</th>
                    <th className="pb-2 font-medium text-muted-foreground hidden sm:table-cell">
                      Performed By
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground hidden md:table-cell">
                      Reason
                    </th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditLog.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-4">
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2 pr-4 hidden sm:table-cell text-muted-foreground">
                        {log.adminUser.name ?? log.adminUser.email}
                      </td>
                      <td className="py-2 pr-4 hidden md:table-cell text-muted-foreground max-w-xs truncate">
                        {log.reason ?? "—"}
                      </td>
                      <td className="py-2 text-right text-muted-foreground whitespace-nowrap">
                        {log.createdAt.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
