"use client";

import { useState } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { contactSchema, type ContactInput } from "@/lib/validations/contact";
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
import { Textarea } from "@/components/ui/textarea";

type ContactResponse = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [showFormError, setShowFormError] = useState(true);

  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: "",
      email: "",
      companyName: "",
      message: "",
    },
    mode: "onBlur",
  });

  async function onSubmit(values: ContactInput) {
    setFormError("");
    setShowFormError(true);

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const data: ContactResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.fieldErrors) {
        for (const [key, messages] of Object.entries(data.fieldErrors)) {
          if (!messages?.length) continue;
          if (
            key === "name" ||
            key === "email" ||
            key === "companyName" ||
            key === "message"
          ) {
            form.setError(key as keyof ContactInput, {
              type: "server",
              message: messages[0],
            });
          }
        }
      }
      setFormError(
        data.error ?? "Failed to send your message. Please try again.",
      );
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-accent/30 bg-accent/5 p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent/10">
          <CheckCircle2 className="size-6 text-accent" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          Message sent
        </h3>
        <p className="text-sm text-muted-foreground">
          Thank you for reaching out. Our team will be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
      {formError && showFormError && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <p>{formError}</p>
          <button
            type="button"
            onClick={() => setShowFormError(false)}
            aria-label="Dismiss error message"
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
                    placeholder="you@company.com"
                    {...field}
                  />
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
                  <Input
                    type="text"
                    autoComplete="organization"
                    placeholder="Your company"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Message</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Tell us about your use case, team size, or any questions you have."
                    rows={5}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Sending..." : "Send message"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
