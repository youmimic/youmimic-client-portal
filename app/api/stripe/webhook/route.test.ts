import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionStatus, PlanType } from "@/app/generated/prisma/enums";
import {
  POST,
  toStatus,
  toPlanType,
  customerId,
  invoiceSubscriptionId,
} from "@/app/api/stripe/webhook/route";

const constructEvent = vi.fn();

vi.mock("@/lib/stripe", () => ({
  default: { webhooks: { constructEvent: (...args: unknown[]) => constructEvent(...args) } },
}));

// Not exercised by the tests below (they stop before any handler runs), but
// lib/prisma.ts throws at import time without DATABASE_URL, and this route
// module imports it at the top level regardless of which branch executes.
vi.mock("@/lib/prisma", () => ({
  default: {},
}));

function makeRequest(body: string, signature = "sig_test"): Request {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body,
    headers: { "stripe-signature": signature },
  });
}

beforeEach(() => {
  constructEvent.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/stripe/webhook — signature verification gate", () => {
  it("returns 500 when STRIPE_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(500);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("returns 500 when STRIPE_WEBHOOK_SECRET is still the placeholder value", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_...");

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(500);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when the signature fails verification", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_real");
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature for payload");
    });

    const res = await POST(makeRequest("{}", "bad-signature"));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid signature");
  });

  it("returns 200 and does nothing for a verified but unrecognized event type", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_real");
    constructEvent.mockReturnValue({
      type: "payment_intent.created",
      data: { object: {} },
    });

    const res = await POST(makeRequest("{}"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ received: true });
  });
});

describe("toStatus", () => {
  it("maps known Stripe statuses to the local enum", () => {
    expect(toStatus("active")).toBe(SubscriptionStatus.ACTIVE);
    expect(toStatus("trialing")).toBe(SubscriptionStatus.TRIALING);
    expect(toStatus("past_due")).toBe(SubscriptionStatus.PAST_DUE);
    expect(toStatus("canceled")).toBe(SubscriptionStatus.CANCELED);
  });

  it("falls back to INCOMPLETE for an unrecognized status", () => {
    // Guards against a future Stripe API version introducing a new status
    // string this app doesn't know about yet — should fail safe, not throw.
    expect(toStatus("some_future_status")).toBe(SubscriptionStatus.INCOMPLETE);
  });
});

describe("toPlanType", () => {
  it("passes through recognized plan types", () => {
    expect(toPlanType(PlanType.CREATOR)).toBe(PlanType.CREATOR);
    expect(toPlanType(PlanType.ENTERPRISE)).toBe(PlanType.ENTERPRISE);
  });

  it("defaults to CREATOR for undefined or unrecognized metadata", () => {
    expect(toPlanType(undefined)).toBe(PlanType.CREATOR);
    expect(toPlanType("something-else")).toBe(PlanType.CREATOR);
  });
});

describe("customerId", () => {
  it("returns a string customer id as-is", () => {
    expect(customerId("cus_123")).toBe("cus_123");
  });

  it("extracts .id from a Customer/DeletedCustomer object", () => {
    expect(customerId({ id: "cus_456" } as never)).toBe("cus_456");
  });

  it("returns null for null/undefined", () => {
    expect(customerId(null)).toBeNull();
    expect(customerId(undefined)).toBeNull();
  });
});

describe("invoiceSubscriptionId", () => {
  it("returns null when the invoice has no subscription_details", () => {
    expect(invoiceSubscriptionId({ parent: null } as never)).toBeNull();
  });

  it("returns the subscription id when it's a plain string", () => {
    const invoice = {
      parent: { subscription_details: { subscription: "sub_123" } },
    };
    expect(invoiceSubscriptionId(invoice as never)).toBe("sub_123");
  });

  it("extracts .id when subscription is an expanded object", () => {
    const invoice = {
      parent: { subscription_details: { subscription: { id: "sub_456" } } },
    };
    expect(invoiceSubscriptionId(invoice as never)).toBe("sub_456");
  });
});
