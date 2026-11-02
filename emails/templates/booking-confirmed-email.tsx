// src/emails/templates/booking-confirmed-email.tsx
import { Text } from "@react-email/components";
import { EmailLayout } from "@/emails/components/email-layout";
import { TALENT_COACHING_SUMMARY } from "@/lib/content/talent-coaching";

type BookingConfirmedEmailProps = {
  name: string;
  dateDisplay: string;
  timeRange: string;
  locationSummary: string;
  capturesCount: number;
  prepareUrl: string;
  bookingsUrl: string;
};

export function BookingConfirmedEmail({
  name,
  dateDisplay,
  timeRange,
  locationSummary,
  capturesCount,
  prepareUrl,
  bookingsUrl,
}: BookingConfirmedEmailProps) {
  return (
    <EmailLayout
      previewText={`Your capture session on ${dateDisplay} is confirmed`}
      heading="Your session is confirmed"
      message={`Hi ${name}, your avatar capture session is locked in.`}
      actionLabel="View your booking"
      actionUrl={bookingsUrl}
      footerNote="If you did not expect this email, please contact our support team."
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
        {TALENT_COACHING_SUMMARY}{" "}
        <a href={prepareUrl} style={{ color: "#4C9997" }}>
          Read the full preparation guide
        </a>{" "}
        before your session.
      </Text>
    </EmailLayout>
  );
}
