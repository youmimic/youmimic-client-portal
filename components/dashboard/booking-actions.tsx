"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelp, Pencil, X, Ban } from "lucide-react";

import {
  updateBookingSchema,
  type UpdateBookingInput,
  MAX_CAPTURES,
  NOTES_MAX,
} from "@/lib/validations/booking";
import { addHoursToTime } from "@/lib/booking-time";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type BookingForActions = {
  id: string;
  requestedDate: string; // "YYYY-MM-DD"
  timeStart: string;
  timeEnd: string;
  capturesCount: number;
  status: string;
  notes: string | null;
  participants: Array<{ firstName: string; contactNumber: string }>;
};

const EDITABLE_STATUSES = ["pending", "confirmed"];

function minBookingDateISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0];
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
      capturesCount: booking.capturesCount,
      timeStart: booking.timeStart,
      timeEnd: booking.timeEnd,
      notes: booking.notes ?? "",
      participants: booking.participants.map((p) => ({
        firstName: p.firstName,
        contactNumber: p.contactNumber,
      })),
    },
    mode: "onBlur",
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "participants",
  });

  const capturesCount = useWatch({ control: form.control, name: "capturesCount" });
  const timeStart = useWatch({ control: form.control, name: "timeStart" });
  const notesValue = useWatch({ control: form.control, name: "notes" }) ?? "";
  const notesLength = notesValue.length;

  // Auto-compute timeEnd when timeStart or capturesCount changes.
  useEffect(() => {
    if (timeStart && capturesCount) {
      form.setValue("timeEnd", addHoursToTime(timeStart, Number(capturesCount)), {
        shouldValidate: false,
      });
    }
  }, [timeStart, capturesCount, form]);

  // Sync participant array length to capturesCount.
  useEffect(() => {
    const count = Number(capturesCount) || 1;
    if (fields.length === count) return;
    replace(
      Array.from({ length: count }, (_, i) => ({
        firstName: fields[i]?.firstName ?? "",
        contactNumber: fields[i]?.contactNumber ?? "",
      })),
    );
  }, [capturesCount, fields, replace]);

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
            Update the date, captures, time, or notes for this booking.
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
                    <Input type="date" min={minBookingDateISO()} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="capturesCount"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-1.5">
                    <FormLabel>Number of captures</FormLabel>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        aria-label="What is a capture?"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Select how many avatar capture sessions are needed. Each
                        capture takes 1 hour, so the end time is calculated
                        automatically.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={String(field.value)}
                    onValueChange={(val) => field.onChange(Number(val))}
                    name={field.name}
                  >
                    <FormControl>
                      <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Array.from({ length: MAX_CAPTURES }, (_, i) => i + 1).map(
                        (n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} {n === 1 ? "capture" : "captures"}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
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
                      <Input
                        type="time"
                        disabled
                        aria-label="End time (auto-calculated)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Participant sub-forms — one block per capture */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Participants</p>
              {fields.map((fieldItem, index) => (
                <div
                  key={fieldItem.id}
                  className="space-y-3 rounded-lg border border-border p-3"
                >
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Capture {index + 1}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`participants.${index}.firstName`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First name</FormLabel>
                          <FormControl>
                            <Input placeholder="Jane" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`participants.${index}.contactNumber`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact number</FormLabel>
                          <FormControl>
                            <Input
                              type="tel"
                              placeholder="+61 4xx xxx xxx"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
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
