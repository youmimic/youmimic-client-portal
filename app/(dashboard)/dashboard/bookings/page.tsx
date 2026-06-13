import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewBookingDialog } from "@/components/dashboard/new-booking-dialog";

export const metadata = {
  title: "Bookings — YouMimic Portal",
};

async function fetchBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    include: { enterprise: { select: { name: true } } },
    orderBy: { requestedDate: "desc" },
  });
}

type BookingRow = Awaited<ReturnType<typeof fetchBookings>>[number];

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  confirmed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  completed:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

function StatusBadge({ status }: { status: string }) {
  const classes =
    STATUS_STYLES[status.toLowerCase()] ?? "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}
    >
      {status}
    </span>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

function BookingsTable({ bookings }: { bookings: BookingRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {bookings.length === 1 ? "1 booking" : `${bookings.length} bookings`}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Time
                </th>
                <th className="hidden px-4 py-3 font-medium text-muted-foreground sm:table-cell">
                  Enterprise
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground">
                  Status
                </th>
                <th className="hidden px-4 py-3 font-medium text-muted-foreground md:table-cell">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bookings.map((booking) => (
                <tr
                  key={booking.id}
                  className="transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">
                    {formatDate(booking.requestedDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {booking.timeStart}–{booking.timeEnd}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {booking.enterprise?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={booking.status} />
                  </td>
                  <td className="hidden max-w-xs truncate px-4 py-3 text-muted-foreground md:table-cell">
                    {booking.notes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function BookingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const bookings = await fetchBookings(session.user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground">
            View and manage your scheduled sessions.
          </p>
        </div>
        <NewBookingDialog />
      </div>

      {bookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays
              className="mb-4 h-10 w-10 text-muted-foreground/50"
              aria-hidden="true"
            />
            <p className="text-base font-medium">No bookings yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your scheduled sessions will appear here once bookings are made.
            </p>
          </CardContent>
        </Card>
      ) : (
        <BookingsTable bookings={bookings} />
      )}
    </div>
  );
}
