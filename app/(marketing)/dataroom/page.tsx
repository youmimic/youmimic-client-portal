import type { Metadata } from "next";
import { ComingSoonPage } from "@/components/marketing/coming-soon-page";

export const metadata: Metadata = {
  title: "Dataroom — YouMimic",
  description: "YouMimic investor dataroom.",
};

export default function DataroomPage() {
  return (
    <ComingSoonPage
      title="Dataroom"
      body="Our investor dataroom is being prepared. If you're an investor looking for information about YouMimic, get in touch and we'll follow up directly."
    />
  );
}
