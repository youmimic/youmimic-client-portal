import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity/visual-editing";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { GoogleTagManagerScripts } from "@/components/analytics/google-tag-manager";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Only ever true inside the Studio's Presentation preview iframe (see
  // app/api/draft-mode/enable/route.ts) — a real visitor never has draft
  // mode on, so the click-to-edit overlay and its extra script never load
  // for them.
  const { isEnabled: isDraftMode } = await draftMode();

  return (
    <>
      <GoogleTagManagerScripts />
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
      {isDraftMode && <VisualEditing />}
    </>
  );
}
