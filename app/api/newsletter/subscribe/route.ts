import { NextResponse } from "next/server";
import { z } from "zod";

// Server-to-server proxy for the Brevo ("Sendinblue") newsletter form —
// see components/marketing/newsletter-form.tsx. Brevo's own form endpoint
// is built for a native <form> POST (full-page navigation to its own
// response page, which is raw JSON — not something we want a visitor to
// ever see or navigate to) and doesn't send CORS headers that would allow
// a browser to fetch() it directly. Posting from our own server instead
// sidesteps CORS entirely (a browser-only restriction) and lets the
// frontend show its own inline success/error state without leaving the
// page.
const BREVO_FORM_URL =
  "https://b7f71b9c.sibforms.com/serve/MUIFAOTXsoAl4QcS6Jjrh6QeCA7xcVMwe7qonH8o7uLP67Gq-qZ6G2LjCXXEJ9LC8-ljKAdTWe0kqzmhawbD2y8m5T5d_s-bvXkUAnJpjFvxbU_QUqwGPtn_aYlnBPAwkreQherlQ7et0F1NUgjnHgu4KPYCLzqOHfbtKGETHhNlRdTnJ7UJdnTyOJuq9R1kdMHHMrdrkUlI5uYkgw==";

const subscribeSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email" },
      { status: 422 },
    );
  }

  // Same field set the native Brevo-generated form posts — see
  // newsletter-form.tsx's comment on why these can't be renamed.
  const formBody = new URLSearchParams({
    EMAIL: parsed.data.email,
    email_address_check: "",
    locale: "en",
    html_type: "simple",
  });

  try {
    const res = await fetch(BREVO_FORM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString(),
    });

    const data = await res.json().catch(() => null);

    // Brevo's own response shape, confirmed live: {"success": true, "message": "..."}
    // on success. Treat anything else (non-2xx, success:false, unparseable
    // body) as a failure rather than assuming success.
    if (res.ok && data?.success) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: typeof data?.message === "string" ? data.message : "Subscription failed. Please try again." },
      { status: 502 },
    );
  } catch (error) {
    console.error("Newsletter subscribe error:", error);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
