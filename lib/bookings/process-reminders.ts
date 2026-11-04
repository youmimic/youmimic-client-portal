import prisma from "@/lib/prisma";
import { sendBookingReminderEmail } from "@/lib/mailer";
import { formatDate } from "@/lib/format";
import { formatLocationSummary } from "@/lib/booking-time";

const HOUR_MS = 60 * 60 * 1000;

function appUrl(): string {
  return process.env.BASE_URL || "http://localhost:3000";
}

// Cron-driven (see app/api/internal/billing/retry-failed-provisioning —
// bundled into that existing daily cron rather than given its own, since
// Vercel's Hobby plan caps this project at 2 scheduled cron jobs and both
// slots are already used — same reasoning as
// lib/checkout/process-draft-lifecycle.ts). Sends a single "tomorrow" email
// for every confirmed booking whose requestedDate falls within the next
// 48 hours and hasn't been reminded yet, then stamps reminder24hSentAt so a
// daily rerun never double-sends. The window is 0-48h rather than exactly
// 24h because this cron only runs once a day (03:00) — a booking at, say,
// 09:00 tomorrow is ~30h out at run time, never exactly 24h.
async function sendDueReminders(): Promise<{ sent: number }> {
  const now = Date.now();

  const due = await prisma.booking.findMany({
    where: {
      status: "confirmed",
      reminder24hSentAt: null,
      requestedDate: {
        gte: new Date(now),
        lte: new Date(now + 48 * HOUR_MS),
      },
    },
    select: {
      id: true,
      requestedDate: true,
      timeStart: true,
      timeEnd: true,
      capturesCount: true,
      captureLocationType: true,
      capitalCity: true,
      suburbOrTown: true,
      stateOrTerritory: true,
      user: { select: { name: true, email: true } },
    },
  });

  let sent = 0;
  for (const booking of due) {
    try {
      await sendBookingReminderEmail({
        to: booking.user.email,
        name: booking.user.name ?? "there",
        dateDisplay: formatDate(booking.requestedDate),
        timeRange: `${booking.timeStart}–${booking.timeEnd}`,
        locationSummary: formatLocationSummary(booking),
        capturesCount: booking.capturesCount,
        prepareUrl: `${appUrl()}/dashboard/bookings/prepare`,
        bookingsUrl: `${appUrl()}/dashboard/bookings`,
        idempotencyKey: `booking-reminder-24h/${booking.id}`,
      });
      await prisma.booking.update({
        where: { id: booking.id },
        data: { reminder24hSentAt: new Date() },
      });
      sent++;
    } catch (err) {
      console.error(`24h booking reminder failed for booking ${booking.id}:`, err);
    }
  }

  return { sent };
}

export async function processBookingReminders() {
  const { sent } = await sendDueReminders();
  return { sent };
}
