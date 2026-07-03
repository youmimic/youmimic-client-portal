"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Ban, Check, CircleHelp, Copy, Mail, Pencil, X } from "lucide-react";

import {
  updateBookingSchema,
  type UpdateBookingInput,
  MAX_CAPTURES,
  NOTES_MAX,
  AUSTRALIAN_CAPITAL_CITIES,
  CAPITAL_CITY_LABELS,
  type CaptureLocationType,
  type AustralianCapitalCity,
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
  captureLocationType: CaptureLocationType | null;
  capitalCity: AustralianCapitalCity | null;
  suburbOrTown: string | null;
  stateOrTerritory: string | null;
  postcode: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  locationNotes: string | null;
};

const EDITABLE_STATUSES = ["pending", "confirmed"];
const CONTACT_SALES_SENTINEL = "contact-sales";
const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "sales@youmimic.com";

// Returns the earliest bookable date as a YYYY-MM-DD string.
// Advances 3 business days from today, skipping Sat/Sun (no holiday logic).
function minBookingDateISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  let businessDaysAdded = 0;
  while (businessDaysAdded < 3) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay(); // 0 = Sun, 6 = Sat
    if (day !== 0 && day !== 6) {
      businessDaysAdded++;
    }
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  const [contactSales, setContactSales] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const form = useForm<UpdateBookingInput>({
    resolver: standardSchemaResolver(updateBookingSchema),
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
      captureLocationType: booking.captureLocationType ?? undefined,
      capitalCity: booking.capitalCity ?? undefined,
      suburbOrTown: booking.suburbOrTown ?? "",
      stateOrTerritory: booking.stateOrTerritory ?? "",
      postcode: booking.postcode ?? "",
      addressLine1: booking.addressLine1 ?? "",
      addressLine2: booking.addressLine2 ?? "",
      locationNotes: booking.locationNotes ?? "",
    },
    mode: "onBlur",
  });

  const { fields, replace } = useFieldArray({
    control: form.control,
    name: "participants",
  });

  const capturesCount = useWatch({
    control: form.control,
    name: "capturesCount",
  });
  const timeStart = useWatch({ control: form.control, name: "timeStart" });
  const notesValue = useWatch({ control: form.control, name: "notes" }) ?? "";
  const notesLength = notesValue.length;
  const captureLocationType = useWatch({
    control: form.control,
    name: "captureLocationType",
  });

  // Auto-compute timeEnd when timeStart or capturesCount changes.
  useEffect(() => {
    if (timeStart && capturesCount) {
      form.setValue(
        "timeEnd",
        addHoursToTime(timeStart, Number(capturesCount)),
        { shouldValidate: false },
      );
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
      setContactSales(false);
      setEmailCopied(false);
    }
  }

  function copyEmail() {
    navigator.clipboard.writeText(SALES_EMAIL).then(() => {
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    });
  }

  async function onSubmit(values: UpdateBookingInput) {
    if (contactSales) return;
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
      <DialogContent
        showCloseButton
        className="sm:max-w-md  max-h-[90vh] overflow-y-auto"
      >
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
            {/* Date is hidden in contact-sales mode */}
            {!contactSales && (
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
            )}

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
                        <CircleHelp
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        Select how many avatar capture sessions are needed. Each
                        capture takes 1 hour, so the end time is calculated
                        automatically.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Select
                    value={
                      contactSales
                        ? CONTACT_SALES_SENTINEL
                        : String(field.value)
                    }
                    onValueChange={(val) => {
                      if (val === CONTACT_SALES_SENTINEL) {
                        setContactSales(true);
                        form.reset({
                          requestedDate: "",
                          capturesCount: 1,
                          timeStart: "09:00",
                          timeEnd: "10:00",
                          notes: "",
                          participants: [{ firstName: "", contactNumber: "" }],
                        });
                      } else {
                        setContactSales(false);
                        field.onChange(Number(val));
                      }
                    }}
                    name={field.name}
                  >
                    <FormControl>
                      <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Array.from(
                        { length: MAX_CAPTURES },
                        (_, i) => i + 1,
                      ).map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} {n === 1 ? "capture" : "captures"}
                        </SelectItem>
                      ))}
                      <SelectItem value={CONTACT_SALES_SENTINEL}>
                        10+ (Contact sales)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {contactSales ? (
              <div
                className="rounded-lg border border-border bg-muted/50 p-4 space-y-3"
                role="status"
                aria-live="polite"
              >
                <p className="text-sm text-muted-foreground">
                  For 10+ avatar capture sessions, please contact sales at:{" "}
                  <span className="inline-flex items-center gap-1">
                    <a
                      href={`mailto:${SALES_EMAIL}`}
                      className="text-primary underline underline-offset-4 hover:text-primary/80"
                    >
                      {SALES_EMAIL}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Copy sales email"
                      onClick={copyEmail}
                    >
                      {emailCopied ? (
                        <Check
                          className="text-green-600 dark:text-green-400"
                          aria-hidden="true"
                        />
                      ) : (
                        <Copy aria-hidden="true" />
                      )}
                    </Button>
                  </span>
                </p>
                <a
                  href={`mailto:${SALES_EMAIL}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  Contact sales
                </a>
              </div>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="captureLocationType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capture location</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(val) => {
                          field.onChange(val);
                          form.setValue("capitalCity", null);
                          form.setValue("suburbOrTown", "");
                          form.setValue("stateOrTerritory", "");
                          form.setValue("postcode", "");
                          form.setValue("addressLine1", "");
                          form.setValue("addressLine2", "");
                          form.setValue("locationNotes", "");
                        }}
                        name={field.name}
                      >
                        <FormControl>
                          <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                            <SelectValue placeholder="Select location type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="capital_city">
                            Capital city
                          </SelectItem>
                          <SelectItem value="regional_other">
                            Regional / Other
                          </SelectItem>
                          <SelectItem value="multi_location">
                            Multi-location
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {captureLocationType === "capital_city" && (
                  <FormField
                    control={form.control}
                    name="capitalCity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capital city</FormLabel>
                        <Select
                          value={field.value ?? ""}
                          onValueChange={(val) => field.onChange(val)}
                          name={field.name}
                        >
                          <FormControl>
                            <SelectTrigger
                              onBlur={field.onBlur}
                              ref={field.ref}
                            >
                              <SelectValue placeholder="Select city" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {AUSTRALIAN_CAPITAL_CITIES.map((city) => (
                              <SelectItem key={city} value={city}>
                                {CAPITAL_CITY_LABELS[city]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {captureLocationType === "regional_other" && (
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="suburbOrTown"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Suburb / Town</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Newtown"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField
                        control={form.control}
                        name="stateOrTerritory"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State / Territory</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. NSW"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="postcode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Postcode</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="e.g. 2042"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Address line 1{" "}
                            <span className="font-normal text-muted-foreground">
                              (optional)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. 42 King Street"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressLine2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Address line 2{" "}
                            <span className="font-normal text-muted-foreground">
                              (optional)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. Level 3"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="locationNotes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Location notes{" "}
                            <span className="font-normal text-muted-foreground">
                              (optional)
                            </span>
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Any additional location details…"
                              className="resize-none"
                              rows={2}
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {captureLocationType === "multi_location" && (
                  <FormField
                    control={form.control}
                    name="locationNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location notes</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          List the planned locations or describe the rollout.
                        </p>
                        <FormControl>
                          <Textarea
                            placeholder="e.g. Sydney CBD office Mon–Tue, Melbourne HQ Wed–Thu…"
                            className="resize-none"
                            rows={3}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

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
              </>
            )}

            <DialogFooter showCloseButton>
              {!contactSales && (
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Saving…" : "Save changes"}
                </Button>
              )}
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
