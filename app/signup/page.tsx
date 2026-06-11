// app/signup/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { registerSchema } from "@/lib/validations/auth";
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

const signupFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1, "Confirm password is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

type SignupFormInput = z.infer<typeof signupFormSchema>;

type RegisterResponse = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
};

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
      acceptTerms: false,
      termsLinkClicked: false,
    },
    mode: "onBlur",
  });

  function handleTermsClick() {
    form.setValue("termsLinkClicked", true, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
  }

  async function onSubmit(values: SignupFormInput) {
    setFormError("");
    setShowFormError(true);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(values),
    });

    const data: RegisterResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.fieldErrors) {
        for (const [key, messages] of Object.entries(data.fieldErrors)) {
          if (!messages?.length) continue;

          if (
            key === "name" ||
            key === "email" ||
            key === "password" ||
            key === "confirmPassword" ||
            key === "acceptTerms" ||
            key === "termsLinkClicked"
          ) {
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
    <main className="container mx-auto flex min-h-screen max-w-lg items-center justify-center px-4 py-10">
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
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
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

              <FormField
                control={form.control}
                name="acceptTerms"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-3 rounded-md border p-3">
                      <input
                        id="acceptTerms"
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="mt-1 h-4 w-4"
                      />
                      <div className="space-y-1">
                        <label
                          htmlFor="acceptTerms"
                          className="text-sm font-medium leading-none"
                        >
                          I agree to the{" "}
                          <a
                            href="/terms-and-conditions.pdf"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleTermsClick}
                            className="underline underline-offset-4"
                          >
                            Terms and Conditions
                          </a>
                        </label>
                        <p className="text-sm text-muted-foreground">
                          You must open the Terms and Conditions link and accept
                          them before creating your account.
                        </p>
                      </div>
                    </div>
                    <FormMessage />
                    {!form.formState.errors.acceptTerms && (
                      <div className="text-sm text-red-600">
                        {form.formState.errors.termsLinkClicked?.message}
                      </div>
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
