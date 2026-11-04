import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  TALENT_COACHING_TIPS,
  TALENT_COACHING_SCRIPT_NOTE,
} from "@/lib/content/talent-coaching";

export const metadata = {
  title: "Prepare for your capture session | YouMimic Portal",
};

export default function BookingPreparePage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/bookings"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to bookings
        </Link>
      </div>

      <PageHeader
        title="Prepare for your capture session"
        description="Read these tips before the day so your recording goes smoothly on the first take."
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">On the day</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {TALENT_COACHING_TIPS.map((tip) => (
              <li key={tip} className="flex gap-2.5 text-sm text-muted-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Your script</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{TALENT_COACHING_SCRIPT_NOTE}</p>
        </CardContent>
      </Card>
    </div>
  );
}
