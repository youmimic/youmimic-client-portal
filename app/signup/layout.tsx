import { MarketingHeader } from "@/components/marketing/marketing-header";

export default function SignupLayout({
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
