// app/forgot-password/page.tsx
import ForgotPasswordForm from "./forgot-password-form";
import { noIndex } from "@/lib/seo";

export const metadata = {
  title: "Forgot Password | YouMimic",
  robots: noIndex,
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
