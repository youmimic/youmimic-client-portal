import { beforeEach, describe, expect, it, vi } from "vitest";
import { processBookingReminders } from "@/lib/bookings/process-reminders";

const findManyBooking = vi.fn();
const updateBooking = vi.fn();
const sendBookingReminderEmail = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    booking: {
      findMany: (...args: unknown[]) => findManyBooking(...args),
      update: (...args: unknown[]) => updateBooking(...args),
    },
  },
}));

vi.mock("@/lib/mailer", () => ({
  sendBookingReminderEmail: (...args: unknown[]) => sendBookingReminderEmail(...args),
}));

const BOOKING = {
  id: "booking_1",
  requestedDate: new Date("2026-11-04T09:00:00.000Z"),
  timeStart: "09:00",
  timeEnd: "10:00",
  capturesCount: 1,
  captureLocationType: "capital_city",
  capitalCity: "sydney",
  suburbOrTown: null,
  stateOrTerritory: null,
  user: { name: "Jane Buyer", email: "buyer@example.com" },
};

beforeEach(() => {
  findManyBooking.mockReset();
  updateBooking.mockReset();
  sendBookingReminderEmail.mockReset();
});

describe("processBookingReminders", () => {
  it("queries only confirmed, not-yet-reminded bookings within the next 48h", async () => {
    findManyBooking.mockResolvedValue([]);

    await processBookingReminders();

    expect(findManyBooking).toHaveBeenCalledTimes(1);
    const where = findManyBooking.mock.calls[0][0].where;
    expect(where.status).toBe("confirmed");
    expect(where.reminder24hSentAt).toBeNull();
    expect(where.requestedDate.gte).toBeInstanceOf(Date);
    expect(where.requestedDate.lte).toBeInstanceOf(Date);
    const windowMs = where.requestedDate.lte.getTime() - where.requestedDate.gte.getTime();
    expect(windowMs).toBe(48 * 60 * 60 * 1000);
  });

  it("sends the reminder and marks reminder24hSentAt", async () => {
    findManyBooking.mockResolvedValue([BOOKING]);
    sendBookingReminderEmail.mockResolvedValue(undefined);

    const result = await processBookingReminders();

    expect(result.sent).toBe(1);
    expect(sendBookingReminderEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendBookingReminderEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe("buyer@example.com");
    expect(emailArgs.name).toBe("Jane Buyer");
    expect(emailArgs.locationSummary).toBe("Sydney");
    expect(emailArgs.idempotencyKey).toBe("booking-reminder-24h/booking_1");

    expect(updateBooking).toHaveBeenCalledWith({
      where: { id: "booking_1" },
      data: { reminder24hSentAt: expect.any(Date) },
    });
  });

  it("does not mark a reminder sent when the email send throws, and keeps processing", async () => {
    findManyBooking.mockResolvedValue([BOOKING]);
    sendBookingReminderEmail.mockRejectedValue(new Error("resend down"));

    const result = await processBookingReminders();

    expect(result.sent).toBe(0);
    expect(updateBooking).not.toHaveBeenCalled();
  });
});
