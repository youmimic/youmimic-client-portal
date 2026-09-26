import { PageHeader } from "@/components/dashboard/page-header";
import { SettingsTabs } from "@/components/dashboard/settings-tabs";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Your account details, access and usage." />
      <SettingsTabs />
      {children}
    </div>
  );
}
