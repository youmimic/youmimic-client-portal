"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ActionState = { loading: boolean; error: string | null };
const idle: ActionState = { loading: false, error: null };

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

async function apiCall(url: string, method: string, body?: Record<string, unknown>) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return res.json().catch(() => ({}));
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

type Contact = {
  id: string;
  type: "BILLING" | "KEY_CONTACT";
  name: string;
  email: string | null;
  phone: string | null;
};

const CONTACT_TYPE_LABEL: Record<Contact["type"], string> = {
  BILLING: "Billing Contact",
  KEY_CONTACT: "Key Contact",
};

export function EnterpriseContactsCard({
  enterpriseId,
  contacts,
  canManage,
}: {
  enterpriseId: string;
  contacts: Contact[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [removing, setRemoving] = useState<Contact | null>(null);

  const [type, setType] = useState<Contact["type"]>("KEY_CONTACT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<ActionState>(idle);

  function resetForm() {
    setType("KEY_CONTACT");
    setName("");
    setEmail("");
    setPhone("");
    setState(idle);
  }

  function openAdd() {
    resetForm();
    setAddOpen(true);
  }

  function openEdit(contact: Contact) {
    setType(contact.type);
    setName(contact.name);
    setEmail(contact.email ?? "");
    setPhone(contact.phone ?? "");
    setState(idle);
    setEditing(contact);
  }

  async function handleAdd() {
    setState({ loading: true, error: null });
    try {
      await apiCall(`/api/admin/enterprises/${enterpriseId}/contacts`, "POST", {
        type,
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
      });
      setAddOpen(false);
      resetForm();
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  async function handleEdit() {
    if (!editing) return;
    setState({ loading: true, error: null });
    try {
      await apiCall(
        `/api/admin/enterprises/${enterpriseId}/contacts/${editing.id}`,
        "PATCH",
        { type, name, email: email || null, phone: phone || null },
      );
      setEditing(null);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  async function handleRemove() {
    if (!removing) return;
    setState({ loading: true, error: null });
    try {
      await apiCall(`/api/admin/enterprises/${enterpriseId}/contacts/${removing.id}`, "DELETE");
      setRemoving(null);
      setState(idle);
      router.refresh();
    } catch (e) {
      setState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  const billing = contacts.filter((c) => c.type === "BILLING");
  const keyContacts = contacts.filter((c) => c.type === "KEY_CONTACT");

  function ContactRow({ contact }: { contact: Contact }) {
    return (
      <div className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0">
        <div className="text-sm">
          <div className="font-medium">{contact.name}</div>
          <div className="text-muted-foreground text-xs">
            {[contact.email, contact.phone].filter(Boolean).join(" · ") || "No details on file"}
          </div>
        </div>
        {canManage && (
          <div className="flex gap-1 shrink-0">
            <Button variant="ghost" size="xs" onClick={() => openEdit(contact)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className="text-destructive hover:text-destructive"
              onClick={() => setRemoving(contact)}
            >
              Remove
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Billing Contact
          </p>
          {billing.length === 0 ? (
            <p className="text-muted-foreground">None on file.</p>
          ) : (
            billing.map((c) => <ContactRow key={c.id} contact={c} />)
          )}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Key Contacts
          </p>
          {keyContacts.length === 0 ? (
            <p className="text-muted-foreground">None on file.</p>
          ) : (
            keyContacts.map((c) => <ContactRow key={c.id} contact={c} />)
          )}
        </div>
        {canManage && (
          <Button variant="outline" size="sm" onClick={openAdd}>
            Add Contact
          </Button>
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>Billing contact or a key contact for this enterprise.</DialogDescription>
          </DialogHeader>
          <ContactForm
            type={type} setType={setType}
            name={name} setName={setName}
            email={email} setEmail={setEmail}
            phone={phone} setPhone={setPhone}
          />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={state.loading || name.trim().length === 0} onClick={handleAdd}>
              {state.loading ? "Adding…" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Contact</DialogTitle>
          </DialogHeader>
          <ContactForm
            type={type} setType={setType}
            name={name} setName={setName}
            email={email} setEmail={setEmail}
            phone={phone} setPhone={setPhone}
          />
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={state.loading || name.trim().length === 0} onClick={handleEdit}>
              {state.loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <Dialog open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Contact</DialogTitle>
            <DialogDescription>
              {removing?.name} will be removed from this enterprise&apos;s contact list.
            </DialogDescription>
          </DialogHeader>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button variant="destructive" size="sm" disabled={state.loading} onClick={handleRemove}>
              {state.loading ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ContactForm({
  type, setType, name, setName, email, setEmail, phone, setPhone,
}: {
  type: Contact["type"]; setType: (t: Contact["type"]) => void;
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="contact-type">Type</Label>
        <Select value={type} onValueChange={(v) => setType((v ?? "KEY_CONTACT") as Contact["type"])} name="contact-type">
          <SelectTrigger id="contact-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="BILLING">{CONTACT_TYPE_LABEL.BILLING}</SelectItem>
            <SelectItem value="KEY_CONTACT">{CONTACT_TYPE_LABEL.KEY_CONTACT}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-name">Name</Label>
        <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-email">Email (optional)</Label>
        <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-phone">Phone (optional)</Label>
        <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing breakdown
// ---------------------------------------------------------------------------

type PlatformFee = {
  id: string;
  unitAmountCents: number | null;
  currency: string;
  billingProvider: string;
} | null;

type AvatarRow = {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  billingStatus: "ACTIVE" | "PAUSED" | "ARCHIVED";
  subscription: {
    id: string;
    unitAmountCents: number | null;
    currency: string;
    currentPeriodEnd: string | null;
  } | null;
};

function isIncludedInTotal(avatar: AvatarRow): boolean {
  if (!avatar.subscription || avatar.subscription.unitAmountCents === null) return false;
  if (avatar.billingStatus === "ACTIVE") return true;
  // PAUSED/ARCHIVED still bill through the period they're already paid for.
  const end = avatar.subscription.currentPeriodEnd;
  return !!end && new Date(end) >= new Date();
}

export function EnterpriseBillingBreakdownCard({
  enterpriseId,
  platformFee,
  avatars,
  canManage,
}: {
  enterpriseId: string;
  platformFee: PlatformFee;
  avatars: AvatarRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeAmount, setFeeAmount] = useState(
    platformFee?.unitAmountCents !== null && platformFee?.unitAmountCents !== undefined
      ? String(platformFee.unitAmountCents / 100)
      : "0",
  );
  const [feeState, setFeeState] = useState<ActionState>(idle);

  const [subTarget, setSubTarget] = useState<AvatarRow | null>(null);
  const [subAmount, setSubAmount] = useState("99");
  const [subStatus, setSubStatus] = useState<AvatarRow["billingStatus"]>("ACTIVE");
  const [subPeriodEnd, setSubPeriodEnd] = useState("");
  const [subState, setSubState] = useState<ActionState>(idle);

  async function handleSetFee() {
    setFeeState({ loading: true, error: null });
    const cents = Math.round(parseFloat(feeAmount || "0") * 100);
    try {
      await apiCall(`/api/admin/enterprises/${enterpriseId}/platform-fee`, "PUT", {
        unitAmountCents: cents,
        currency: platformFee?.currency ?? "AUD",
        billingProvider: platformFee?.billingProvider ?? "STRIPE",
      });
      setFeeOpen(false);
      router.refresh();
    } catch (e) {
      setFeeState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  function openSubDialog(avatar: AvatarRow) {
    setSubAmount(
      avatar.subscription?.unitAmountCents !== null && avatar.subscription?.unitAmountCents !== undefined
        ? String(avatar.subscription.unitAmountCents / 100)
        : "99",
    );
    setSubStatus(avatar.billingStatus);
    setSubPeriodEnd(toDateInputValue(avatar.subscription?.currentPeriodEnd ?? null));
    setSubState(idle);
    setSubTarget(avatar);
  }

  async function handleSaveSub() {
    if (!subTarget) return;
    setSubState({ loading: true, error: null });
    const cents = Math.round(parseFloat(subAmount || "0") * 100);
    try {
      if (subTarget.subscription) {
        await apiCall(
          `/api/admin/enterprises/${enterpriseId}/avatars/${subTarget.id}/storage-subscription/${subTarget.subscription.id}`,
          "PATCH",
          {
            unitAmountCents: cents,
            billingStatus: subStatus,
            currentPeriodEnd: subPeriodEnd || null,
          },
        );
      } else {
        await apiCall(
          `/api/admin/enterprises/${enterpriseId}/avatars/${subTarget.id}/storage-subscription`,
          "POST",
          {
            unitAmountCents: cents,
            ...(subPeriodEnd ? { currentPeriodEnd: subPeriodEnd } : {}),
          },
        );
      }
      setSubTarget(null);
      router.refresh();
    } catch (e) {
      setSubState({ loading: false, error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  const currency = platformFee?.currency ?? "AUD";
  const totalCents =
    (platformFee?.unitAmountCents ?? 0) +
    avatars.reduce((sum, a) => {
      if (!isIncludedInTotal(a) || a.subscription?.unitAmountCents == null) return sum;
      return sum + a.subscription.unitAmountCents;
    }, 0);

  return (
    <>
      <div className="text-sm">
        <div className="flex items-center justify-between gap-3 py-2 border-b">
          <div>
            <div className="font-medium">Platform Access Fee</div>
            <div className="text-xs text-muted-foreground">Flat, negotiated per enterprise</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular-nums font-medium">
              {platformFee?.unitAmountCents !== null && platformFee?.unitAmountCents !== undefined
                ? formatAmount(platformFee.unitAmountCents, currency)
                : "Not set"}
            </span>
            {canManage && (
              <Button variant="ghost" size="xs" onClick={() => setFeeOpen(true)}>
                Edit
              </Button>
            )}
          </div>
        </div>

        {avatars.length === 0 ? (
          <p className="text-muted-foreground py-3">No avatars on this enterprise yet.</p>
        ) : (
          avatars.map((avatar) => {
            const included = isIncludedInTotal(avatar);
            return (
              <div key={avatar.id} className="flex items-center justify-between gap-3 py-2 border-b">
                <div>
                  <div className="font-medium">{avatar.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[avatar.contactName, avatar.contactPhone].filter(Boolean).join(" · ") || "No avatar contact on file"}
                    {" · "}
                    <span
                      className={
                        avatar.billingStatus === "ACTIVE"
                          ? "text-green-600 dark:text-green-400"
                          : avatar.billingStatus === "PAUSED"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-muted-foreground"
                      }
                    >
                      {avatar.billingStatus === "ACTIVE" ? "Active" : avatar.billingStatus === "PAUSED" ? "Paused" : "Archived"}
                    </span>
                    {avatar.billingStatus !== "ACTIVE" && (
                      <span className="text-muted-foreground">
                        {included ? " — billed through current period" : " — no longer billed"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium">
                    {avatar.subscription?.unitAmountCents !== null && avatar.subscription?.unitAmountCents !== undefined
                      ? formatAmount(avatar.subscription.unitAmountCents, avatar.subscription.currency)
                      : "Not priced"}
                  </span>
                  {canManage && (
                    <Button variant="ghost" size="xs" onClick={() => openSubDialog(avatar)}>
                      {avatar.subscription ? "Edit" : "Add subscription"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}

        <div className="flex items-center justify-between pt-3">
          <span className="font-semibold">Monthly total</span>
          <span className="font-semibold tabular-nums">{formatAmount(totalCents, currency)}</span>
        </div>
      </div>

      {/* Platform fee dialog */}
      <Dialog open={feeOpen} onOpenChange={setFeeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Platform Access Fee</DialogTitle>
            <DialogDescription>
              Flat monthly fee for this enterprise. Enter 0 for a negotiated $0 deal — that&apos;s a
              real value, not the same as leaving it unset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="platform-fee-amount">Amount ({currency})</Label>
            <Input
              id="platform-fee-amount"
              type="number"
              min="0"
              step="0.01"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
            />
          </div>
          {feeState.error && <p className="text-sm text-destructive">{feeState.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={feeState.loading} onClick={handleSetFee}>
              {feeState.loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Avatar subscription dialog */}
      <Dialog open={subTarget !== null} onOpenChange={(o) => { if (!o) setSubTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {subTarget?.subscription ? "Edit" : "Add"} Storage Subscription — {subTarget?.name}
            </DialogTitle>
            <DialogDescription>
              Per-avatar pricing varies by deal — this is always an editable amount, not a fixed $99.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sub-amount">Monthly amount (AUD)</Label>
            <Input
              id="sub-amount"
              type="number"
              min="0"
              step="0.01"
              value={subAmount}
              onChange={(e) => setSubAmount(e.target.value)}
            />
          </div>
          {subTarget?.subscription && (
            <div className="space-y-2">
              <Label htmlFor="sub-status">Billing status</Label>
              <Select value={subStatus} onValueChange={(v) => setSubStatus((v ?? "ACTIVE") as AvatarRow["billingStatus"])} name="sub-status">
                <SelectTrigger id="sub-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="PAUSED">Paused</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sub-period-end">Current period end (optional)</Label>
            <Input
              id="sub-period-end"
              type="date"
              value={subPeriodEnd}
              onChange={(e) => setSubPeriodEnd(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              If paused or archived, billing continues showing in the total until this date.
            </p>
          </div>
          {subState.error && <p className="text-sm text-destructive">{subState.error}</p>}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button size="sm" disabled={subState.loading} onClick={handleSaveSub}>
              {subState.loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
