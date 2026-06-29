"use client";

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { inviteSchema, type InviteInput } from "@/lib/validations/invite";
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

type InviteResponse = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function InviteForm({ enterpriseName }: { enterpriseName: string }) {
  const [submitted, setSubmitted] = useState(false);
  const [lastEmail, setLastEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [showFormError, setShowFormError] = useState(true);

  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  async function onSubmit(values: InviteInput) {
    setFormError("");
    setShowFormError(true);

    const response = await fetch("/api/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const data: InviteResponse = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.fieldErrors) {
        for (const [key, messages] of Object.entries(data.fieldErrors)) {
          if (!messages?.length) continue;
          if (key === "email") {
            form.setError("email", { type: "server", message: messages[0] });
          }
        }
      }
      setFormError(data.error ?? "Failed to send invite. Please try again.");
      return;
    }

    setLastEmail(values.email);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-start gap-4">
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Invitation sent to <strong>{lastEmail}</strong>.
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setSubmitted(false);
            setLastEmail("");
            form.reset();
          }}
        >
          Invite another member
        </Button>
      </div>
    );
  }

  return (
    <div>
      {formError && showFormError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
          <p>{formError}</p>
          <button
            type="button"
            onClick={() => setShowFormError(false)}
            aria-label="Dismiss error message"
            className="shrink-0 rounded-sm p-1 transition hover:bg-red-100 dark:hover:bg-red-900/40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-3"
          noValidate
          aria-label={`Invite a member to ${enterpriseName}`}
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="teammate@company.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Sending..." : "Send invite"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
