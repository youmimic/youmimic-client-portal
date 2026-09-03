import type { Metadata } from "next";
import { ComingSoonPage } from "@/components/marketing/coming-soon-page";

export const metadata: Metadata = {
  title: "Media Center — YouMimic",
  description: "YouMimic media resources and brand assets.",
};

export default function MediaCenterPage() {
  return (
    <ComingSoonPage
      title="Media Center"
      body="Brand assets, logos, and media resources are on the way. Need something sooner? Get in touch and we'll send it over."
    />
  );
}
