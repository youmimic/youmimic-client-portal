"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, X } from "lucide-react";

import {
  createBookingSchema,
  type CreateBookingInput,
} from "@/lib/validations/booking";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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

export function NewBookingDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState("");

  const form = useForm<CreateBookingInput>({
    resolver: zodResolver(createBookingSchema),
    defaultValues: {
      requestedDate: "",
      timeStart: "09:00",
      timeEnd: "10:00",
      notes: "",
    },
    mode: "onBlur",
  });

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      form.reset();
      setServerError("");
    }
  }

  async function onSubmit(values: CreateBookingInput) {
    setServerError("");

    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (res.ok) {
      setOpen(false);
      form.reset();
      router.refresh();
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 422 && data.fieldErrors) {
      const fieldErrors = data.fieldErrors as Partial<
        Record<keyof CreateBookingInput, string[]>
      >;
      (Object.keys(fieldErrors) as (keyof CreateBookingInput)[]).forEach(
        (field) => {
          const messages = fieldErrors[field];
          if (messages?.[0]) {
            form.setError(field, { message: messages[0] });
          }
        },
      );
      return;
    }

    setServerError(data.error ?? "Something went wrong. Please try again.");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Plus aria-hidden="true" />
        New booking
      </Button>

      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New booking</DialogTitle>
          <DialogDescription>
            Request a session by choosing a date and time.
          </DialogDescription>
        </DialogHeader>

        {serverError && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
            <p>{serverError}</p>
            <button
              type="button"
              onClick={() => setServerError("")}
              aria-label="Dismiss error"
              className="shrink-0 rounded-sm p-1 text-red-700 transition hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <FormField
              control={form.control}
              name="requestedDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="timeStart"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timeEnd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Notes{" "}
                    <span className="text-muted-foreground font-normal">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any context or requests for this session…"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter showCloseButton>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Requesting…"
                  : "Request booking"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
