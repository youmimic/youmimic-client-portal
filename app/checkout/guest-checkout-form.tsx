"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import type {
  GuestCheckoutPlanType,
  GuestCheckoutBillingTerm,
} from "@/lib/validations/checkout-draft";

// Client-side mirror of lib/validations/checkout-draft.ts's shape (not the
// schema itself — that one lives server-side only and is the actual
// authority). This just gives react-hook-form something to validate against
// before a submit; the real validation happens again on the server.
const formSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  companyName: z.string().optional(),
});

type FormInput = z.infer<typeof formSchema>;

const KNOWN_FIELD_KEYS = new Set<keyof FormInput>(["email", "fullName", "companyName"]);

export function GuestCheckoutForm({
  planType,
  billingTerm,
  resumeDraftId,
  initialEmail,
  initialFullName,
  initialCompanyName,
}: {
  planType: GuestCheckoutPlanType;
  billingTerm: GuestCheckoutBillingTerm;
  // Present when arriving from a reminder email's resume link (see
  // app/checkout/page.tsx) — edits that existing draft in place instead of
  // creating a new one, so returning multiple times still produces exactly
  // one draft and exactly one pair of reminder emails.
  resumeDraftId?: string;
  initialEmail?: string;
  initialFullName?: string;
  initialCompanyName?: string;
}) {
  const [formError, setFormError] = useState("");

  const form = useForm<FormInput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: initialEmail ?? "",
      fullName: initialFullName ?? "",
      companyName: initialCompanyName ?? "",
    },
    mode: "onBlur",
  });

  async function onSubmit(values: FormInput) {
    setFormError("");

    try {
      const draftRes = await fetch(
        resumeDraftId ? `/api/checkout-draft/${resumeDraftId}` : "/api/checkout-draft",
        {
          method: resumeDraftId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...values, planType, billingTerm }),
        },
      );
      const draftData = await draftRes.json().catch(() => ({}));

      if (!draftRes.ok) {
        if (draftData.fieldErrors) {
          for (const [key, messages] of Object.entries(
            draftData.fieldErrors as Record<string, string[] | undefined>,
          )) {
            if (!messages?.length) continue;
            if (KNOWN_FIELD_KEYS.has(key as keyof FormInput)) {
              form.setError(key as keyof FormInput, {
                type: "server",
                message: messages[0],
              });
            }
          }
        }
        setFormError(draftData.error ?? "Something went wrong. Please try again.");
        return;
      }

      const sessionRes = await fetch("/api/stripe/guest-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: draftData.draftId }),
      });
      const sessionData = await sessionRes.json().catch(() => ({}));

      if (!sessionRes.ok || !sessionData.url) {
        setFormError(sessionData.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Don't reset submitting state — the page is navigating away to Stripe.
      window.location.assign(sessionData.url);
    } catch {
      setFormError("Network error. Please try again.");
    }
  }

  return (
    <div className="space-y-4">
      {formError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
          {formError}
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="you@company.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input type="text" autoComplete="name" placeholder="Your full name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company name</FormLabel>
                <FormControl>
                  <Input type="text" autoComplete="organization" placeholder="Your company" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <p className="text-xs text-muted-foreground">
            No password required to continue. We&apos;ll use your email to send your receipt and
            help you access your workspace after payment.
          </p>

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Redirecting…" : "Proceed to payment"}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
