import { MarketingHeader } from "@/components/marketing/marketing-header";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingHeader />
      {children}
    </>
  );
}
