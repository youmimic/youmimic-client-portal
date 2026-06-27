import { NextResponse } from "next/server";
import { contactSchema } from "@/lib/validations/contact";
import { sendContactNotificationEmail } from "@/lib/mailer";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = contactSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        error: "Invalid form data",
        fieldErrors: result.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    await sendContactNotificationEmail(result.data);
  } catch (err) {
    console.error("Contact email failed:", err);
    return NextResponse.json(
      { error: "Failed to send your message. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
