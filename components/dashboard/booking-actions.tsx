"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, X, Ban } from "lucide-react";

import {
  updateBookingSchema,
  type UpdateBookingInput,
  NOTES_MAX,
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

export type BookingForActions = {
  id: string;
  requestedDate: string; // "YYYY-MM-DD"
  timeStart: string;
  timeEnd: string;
  status: string;
  notes: string | null;
};

const EDITABLE_STATUSES = ["pending", "confirmed"];

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
      <p>{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="shrink-0 rounded-sm p-1 text-red-700 transition hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function EditDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: BookingForActions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");

  const form = useForm<UpdateBookingInput>({
    resolver: zodResolver(updateBookingSchema),
    defaultValues: {
      requestedDate: booking.requestedDate,
      timeStart: booking.timeStart,
      timeEnd: booking.timeEnd,
      notes: booking.notes ?? "",
    },
    mode: "onBlur",
  });

  const notesValue = useWatch({ control: form.control, name: "notes" }) ?? "";
  const notesLength = notesValue.length;

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      form.reset();
      setServerError("");
    }
  }

  async function onSubmit(values: UpdateBookingInput) {
    setServerError("");

    const res = await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (res.ok) {
      onOpenChange(false);
      form.reset();
      router.refresh();
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 422 && data.fieldErrors) {
      const fieldErrors = data.fieldErrors as Partial<
        Record<keyof UpdateBookingInput, string[]>
      >;
      (Object.keys(fieldErrors) as (keyof UpdateBookingInput)[]).forEach(
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
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit booking</DialogTitle>
          <DialogDescription>
            Update the date, time, or notes for this booking.
          </DialogDescription>
        </DialogHeader>

        {serverError && (
          <ErrorBanner
            message={serverError}
            onDismiss={() => setServerError("")}
          />
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
                    <Input type="date" min={todayISO()} {...field} />
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
                  <div className="flex items-baseline justify-between">
                    <FormLabel>
                      Notes{" "}
                      <span className="text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </FormLabel>
                    <span
                      className={`text-xs tabular-nums ${
                        notesLength > NOTES_MAX
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                      aria-live="polite"
                    >
                      {notesLength}/{NOTES_MAX}
                    </span>
                  </div>
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
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({
  bookingId,
  open,
  onOpenChange,
}: {
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  async function handleCancel() {
    setSubmitting(true);
    setServerError("");

    const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: "POST",
    });

    setSubmitting(false);

    if (res.ok) {
      onOpenChange(false);
      router.refresh();
      return;
    }

    const data = await res.json().catch(() => ({}));
    setServerError(data.error ?? "Something went wrong. Please try again.");
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) setServerError("");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel booking?</DialogTitle>
          <DialogDescription>
            This will mark your booking as cancelled. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        {serverError && (
          <ErrorBanner
            message={serverError}
            onDismiss={() => setServerError("")}
          />
        )}

        <DialogFooter showCloseButton>
          <Button
            variant="destructive"
            disabled={submitting}
            onClick={handleCancel}
          >
            {submitting ? "Cancelling…" : "Yes, cancel booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BookingActions({ booking }: { booking: BookingForActions }) {
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!EDITABLE_STATUSES.includes(booking.status)) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Edit booking"
          title="Edit"
          onClick={() => setEditOpen(true)}
        >
          <Pencil aria-hidden="true" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Cancel booking"
          title="Cancel"
          onClick={() => setCancelOpen(true)}
          className="text-destructive hover:text-destructive"
        >
          <Ban aria-hidden="true" />
        </Button>
      </div>

      <EditDialog
        booking={booking}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <CancelDialog
        bookingId={booking.id}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </>
  );
}
