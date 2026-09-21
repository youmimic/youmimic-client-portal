import { Suspense } from "react";
import SignupForm from "./signup-form";
import { noIndex } from "@/lib/seo";

export const metadata = {
  title: "Sign up | YouMimic",
  robots: noIndex,
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
