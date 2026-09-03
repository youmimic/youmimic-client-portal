import type { Metadata } from "next";
import { ComingSoonPage } from "@/components/marketing/coming-soon-page";

export const metadata: Metadata = {
  title: "Careers — YouMimic",
  description: "Careers at YouMimic.",
};

export default function CareersPage() {
  return (
    <ComingSoonPage
      title="Careers"
      body="We're not hiring publicly yet, but we're always open to hearing from people who want to build the future of AI video communication. Reach out and introduce yourself."
    />
  );
}
