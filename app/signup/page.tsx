"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { registerSchema, ACCOUNT_TYPES } from "@/lib/validations/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

const signupFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
    if (data.accountType === "BUSINESS") {
      const biz = (data.businessName ?? "").trim();
      if (biz.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["businessName"],
          message: "Business name is required",
        });
      }
    }
  });

type SignupFormInput = z.infer<typeof signupFormSchema>;

type RegisterResponse = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
};

const KNOWN_FIELD_KEYS = new Set<keyof SignupFormInput>([
  "name",
  "email",
  "password",
  "confirmPassword",
  "accountType",
  "businessName",
  "acceptTerms",
  "termsLinkClicked",
  "acceptPrivacyPolicy",
  "privacyPolicyLinkClicked",
]);

export default function SignupPage() {
  const router = useRouter();
  const [formError, setFormError] = useState("");
  const [showFormError, setShowFormError] = useState(true);

  const form = useForm<SignupFormInput>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      accountType: "INDIVIDUAL",
      businessName: "",
      acceptTerms: false,
      termsLinkClicked: false,
      acceptPrivacyPolicy: false,
      privacyPolicyLinkClicked: false,
    },
    mode: "onBlur",
  });

  const accountType = form.watch("accountType");

  function handleTermsClick() {
    form.setValue("termsLinkClicked", true, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });

    void form.trigger(["termsLinkClicked", "acceptTerms"]);
  }

  function handlePrivacyPolicyClick() {
    form.setValue("privacyPolicyLinkClicked", true, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });

    void form.trigger(["privacyPolicyLinkClicked", "acceptPrivacyPolicy"]);
  }

  async function onSubmit(values: SignupFormInput) {
    setFormError("");
    setShowFormError(true);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const data: RegisterResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.fieldErrors) {
        for (const [key, messages] of Object.entries(data.fieldErrors)) {
          if (!messages?.length) continue;
          if (KNOWN_FIELD_KEYS.has(key as keyof SignupFormInput)) {
            form.setError(key as keyof SignupFormInput, {
              type: "server",
              message: messages[0],
            });
          }
        }
      }

      setFormError(data.error ?? "Unable to create your account.");
      return;
    }

    router.push("/login?registered=1");
    router.refresh();
  }

  return (
    <main className="container mx-auto flex flex-1 max-w-lg items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Create account</CardTitle>
          <CardDescription>
            Sign up with your name, email, and password.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {formError && showFormError && (
            <div className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <p>{formError}</p>
              <button
                type="button"
                onClick={() => setShowFormError(false)}
                aria-label="Dismiss signup error message"
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
              {/* Account type toggle */}
              <FormField
                control={form.control}
                name="accountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account type</FormLabel>
                    <div className="grid grid-cols-2 overflow-hidden rounded-md border">
                      {ACCOUNT_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            field.onChange(type);
                            if (type === "INDIVIDUAL") {
                              form.setValue("businessName", "");
                              void form.trigger("businessName");
                            }
                          }}
                          className={cn(
                            "px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            field.value === type
                              ? "bg-primary text-primary-foreground"
                              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                            type === "INDIVIDUAL" ? "rounded-l-md" : "rounded-r-md",
                          )}
                          aria-pressed={field.value === type}
                        >
                          {type === "INDIVIDUAL" ? "Individual" : "Business"}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Business name — shown only when Business is selected */}
              {accountType === "BUSINESS" && (
                <FormField
                  control={form.control}
                  name="businessName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business name</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          autoComplete="organization"
                          placeholder="Your business name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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

              <input type="hidden" {...form.register("termsLinkClicked")} />
              <input
                type="hidden"
                {...form.register("privacyPolicyLinkClicked")}
              />

              <FormField
                control={form.control}
                name="acceptTerms"
                render={({ field }) => (
                  <FormItem
                    className="rounded-md border p-4"
                    data-invalid={
                      !!form.formState.errors.acceptTerms ||
                      !!form.formState.errors.termsLinkClicked
                    }
                  >
                    <div className="flex items-start space-x-3">
                      <FormControl>
                        <Checkbox
                          id="acceptTerms"
                          checked={field.value ?? false}
                          onCheckedChange={async (checked) => {
                            field.onChange(checked === true);
                            await form.trigger([
                              "acceptTerms",
                              "termsLinkClicked",
                            ]);
                          }}
                          aria-invalid={
                            !!form.formState.errors.acceptTerms ||
                            !!form.formState.errors.termsLinkClicked
                          }
                        />
                      </FormControl>

                      <div className="space-y-1 leading-none">
                        <FormLabel
                          htmlFor="acceptTerms"
                          className="cursor-pointer text-sm font-medium"
                        >
                          I agree to the{" "}
                          <a
                            href="/2026-05-07 Amended TOB.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleTermsClick}
                            className="underline underline-offset-4 hover:text-primary"
                          >
                            Terms and Conditions
                          </a>
                        </FormLabel>

                        <p className="text-sm text-muted-foreground">
                          You must open and review the Terms and Conditions
                          before continuing.
                        </p>
                      </div>
                    </div>

                    <FormMessage className="mt-2" />

                    {!form.formState.errors.acceptTerms &&
                      form.formState.errors.termsLinkClicked?.message && (
                        <p className="mt-2 text-sm font-medium text-destructive">
                          {form.formState.errors.termsLinkClicked.message}
                        </p>
                      )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="acceptPrivacyPolicy"
                render={({ field }) => (
                  <FormItem
                    className="rounded-md border p-4"
                    data-invalid={
                      !!form.formState.errors.acceptPrivacyPolicy ||
                      !!form.formState.errors.privacyPolicyLinkClicked
                    }
                  >
                    <div className="flex items-start space-x-3">
                      <FormControl>
                        <Checkbox
                          id="acceptPrivacyPolicy"
                          checked={field.value ?? false}
                          onCheckedChange={async (checked) => {
                            field.onChange(checked === true);
                            await form.trigger([
                              "acceptPrivacyPolicy",
                              "privacyPolicyLinkClicked",
                            ]);
                          }}
                          aria-invalid={
                            !!form.formState.errors.acceptPrivacyPolicy ||
                            !!form.formState.errors.privacyPolicyLinkClicked
                          }
                        />
                      </FormControl>

                      <div className="space-y-1 leading-none">
                        <FormLabel
                          htmlFor="acceptPrivacyPolicy"
                          className="cursor-pointer text-sm font-medium"
                        >
                          I agree to the{" "}
                          <a
                            href="/2026-05-07 YouMimic Privacy Policy.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handlePrivacyPolicyClick}
                            className="underline underline-offset-4 hover:text-primary"
                          >
                            Privacy Policy
                          </a>
                        </FormLabel>

                        <p className="text-sm text-muted-foreground">
                          You must open the Privacy Policy before continuing.
                        </p>
                      </div>
                    </div>

                    <FormMessage className="mt-2" />

                    {!form.formState.errors.acceptPrivacyPolicy &&
                      form.formState.errors.privacyPolicyLinkClicked
                        ?.message && (
                        <p className="mt-2 text-sm font-medium text-destructive">
                          {
                            form.formState.errors.privacyPolicyLinkClicked
                              .message
                          }
                        </p>
                      )}
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Creating account..."
                  : "Create account"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
