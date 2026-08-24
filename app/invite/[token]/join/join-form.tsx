"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { confirmPasswordSchema } from "@/lib/validations/signup-form";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { LegalAcceptanceField } from "@/components/legal/legal-acceptance-field";

const joinFormSchema = confirmPasswordSchema.superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Passwords do not match",
    });
  }
});

type JoinFormInput = z.infer<typeof joinFormSchema>;

type RegisterResponse = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  emailVerified?: boolean;
  joinedEnterpriseName?: string | null;
};

const KNOWN_FIELD_KEYS = new Set<keyof JoinFormInput>([
  "name",
  "password",
  "confirmPassword",
  "acceptTerms",
  "termsLinkClicked",
  "acceptPrivacyPolicy",
  "privacyPolicyLinkClicked",
]);

export default function JoinForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState("");
  const [showFormError, setShowFormError] = useState(true);

  const callbackUrl = `/invite/${token}`;

  const form = useForm<JoinFormInput>({
    resolver: zodResolver(joinFormSchema),
    defaultValues: {
      name: "",
      email,
      password: "",
      confirmPassword: "",
      // Invited members join an existing enterprise — "BUSINESS" would make
      // registerUser() create a brand new enterprise, which is wrong here.
      accountType: "INDIVIDUAL",
      acceptTerms: false,
      termsLinkClicked: false,
      acceptPrivacyPolicy: false,
      privacyPolicyLinkClicked: false,
    },
    mode: "onBlur",
  });

  const acceptTerms = form.watch("acceptTerms");
  const acceptPrivacyPolicy = form.watch("acceptPrivacyPolicy");

  function handleAcceptTerms() {
    form.setValue("acceptTerms", true, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    form.setValue("termsLinkClicked", true, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    void form.trigger(["acceptTerms", "termsLinkClicked"]);
  }

  function handleAcceptPrivacyPolicy() {
    form.setValue("acceptPrivacyPolicy", true, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    form.setValue("privacyPolicyLinkClicked", true, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    void form.trigger(["acceptPrivacyPolicy", "privacyPolicyLinkClicked"]);
  }

  async function onSubmit(values: JoinFormInput) {
    setFormError("");
    setShowFormError(true);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, callbackUrl, inviteToken: token }),
    });

    const data: RegisterResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.fieldErrors) {
        for (const [key, messages] of Object.entries(data.fieldErrors)) {
          if (!messages?.length) continue;
          if (KNOWN_FIELD_KEYS.has(key as keyof JoinFormInput)) {
            form.setError(key as keyof JoinFormInput, {
              type: "server",
              message: messages[0],
            });
          }
        }
      }

      setFormError(data.error ?? "Unable to create your account.");
      return;
    }

    // If membership was already created (the common case — the invite was
    // validated server-side during registration), skip the redundant stop
    // at /invite/[token] after login and go straight to the dashboard with
    // a welcome banner. Only fall back to /invite/[token] as the post-login
    // destination if the server couldn't complete the join here (e.g. the
    // invite was cancelled between page load and submit) — that page will
    // then complete the acceptance itself or show why it couldn't.
    const postLoginUrl = data.joinedEnterpriseName
      ? `/dashboard?joined=${encodeURIComponent(data.joinedEnterpriseName)}`
      : callbackUrl;

    const loginParams = new URLSearchParams({
      registered: "1",
      callbackUrl: postLoginUrl,
      email,
    });
    // Only claim "verified" if the server actually skipped verification
    // (it re-validates the invite itself — a race where the invite was
    // cancelled between page load and submit falls back to normal
    // verification, so don't assume success here implies it was skipped).
    if (data.emailVerified) {
      loginParams.set("verified", "1");
    }
    router.push(`/login?${loginParams.toString()}`);
    router.refresh();
  }

  return (
    <div>
      {formError && showFormError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{formError}</p>
          <button
            type="button"
            onClick={() => setShowFormError(false)}
            aria-label="Dismiss join error message"
            className="shrink-0 rounded-sm p-1 text-red-700 transition hover:bg-red-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
        >
          <input type="hidden" {...form.register("email")} />
          <input type="hidden" {...form.register("accountType")} />

          <p className="text-sm text-muted-foreground">
            Creating an account for{" "}
            <strong className="text-foreground">{email}</strong>
          </p>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    autoComplete="name"
                    placeholder="Your full name"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Create a strong password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Confirm your password"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <LegalAcceptanceField
            label="Terms and Conditions"
            fileUrl="/terms-of-business.pdf"
            accepted={acceptTerms ?? false}
            onAccept={handleAcceptTerms}
            error={
              form.formState.errors.acceptTerms?.message ??
              form.formState.errors.termsLinkClicked?.message
            }
          />

          <LegalAcceptanceField
            label="Privacy Policy"
            fileUrl="/privacy-policy.pdf"
            accepted={acceptPrivacyPolicy ?? false}
            onAccept={handleAcceptPrivacyPolicy}
            error={
              form.formState.errors.acceptPrivacyPolicy?.message ??
              form.formState.errors.privacyPolicyLinkClicked?.message
            }
          />

          <Button
            type="submit"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Creating account..." : "Create account & join"}
          </Button>
        </form>
      </Form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login?${new URLSearchParams({ callbackUrl, email }).toString()}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
