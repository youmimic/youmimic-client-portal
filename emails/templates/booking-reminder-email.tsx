// src/emails/templates/booking-reminder-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";
import { TALENT_COACHING_SUMMARY } from "@/lib/content/talent-coaching";

type BookingReminderEmailProps = {
  name: string;
  dateDisplay: string;
  timeRange: string;
  locationSummary: string;
  capturesCount: number;
  prepareUrl: string;
  bookingsUrl: string;
};

export function BookingReminderEmail({
  name,
  dateDisplay,
  timeRange,
  locationSummary,
  capturesCount,
  prepareUrl,
  bookingsUrl,
}: BookingReminderEmailProps) {
  return (
    <EmailLayout
      previewText={`Your capture session is coming up on ${dateDisplay}`}
      heading="It's almost time"
      message={`Hi ${name}, your avatar capture session is coming up soon.`}
      actionLabel="View your booking"
      actionUrl={bookingsUrl}
      footerNote="If you need to reschedule, contact our support team as soon as possible."
    >
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#333333",
          margin: 0,
        }}
      >
        {dateDisplay}, {timeRange} · {locationSummary} · {capturesCount}{" "}
        {capturesCount === 1 ? "capture" : "captures"}
      </Text>
      <Text
        style={{
          fontSize: "16px",
          lineHeight: "28px",
          color: "#333333",
          marginTop: "16px",
        }}
      >
        A quick reminder before you go: {TALENT_COACHING_SUMMARY}{" "}
        <a href={prepareUrl} style={{ color: "#4C9997" }}>
          Read the full preparation guide
        </a>
        .
      </Text>
    </EmailLayout>
  );
}
