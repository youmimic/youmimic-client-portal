import type { Metadata } from "next";
import { ComingSoonPage } from "@/components/marketing/coming-soon-page";

export const metadata: Metadata = {
  title: "AI Ethics — YouMimic",
  description: "YouMimic's approach to responsible AI avatar generation.",
};

export default function AiEthicsPage() {
  return (
    <ComingSoonPage
      title="AI Ethics"
      body="We're preparing a full statement on our approach to responsible AI avatar generation, consent, and likeness usage. Have a question in the meantime? Reach out to our team."
    />
  );
}
