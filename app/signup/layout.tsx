import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { GoogleTagManagerScripts } from "@/components/analytics/google-tag-manager";

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <GoogleTagManagerScripts />
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </>
  );
}
