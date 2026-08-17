// app/api/register/route.ts
import { NextResponse } from "next/server";
import { registerUser } from "@/lib/auth/register-user";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateLimit = await checkRateLimit({
      key: `register:ip:${ip}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const body = await req.json();

    const result = await registerUser(body);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          fieldErrors: result.fieldErrors,
        },
        { status: result.status },
      );
    }

    return NextResponse.json(
      {
        message: result.emailVerified
          ? "Account created successfully."
          : "User registered successfully. Please verify your email. Make sure to check the spam folder.",
        emailVerified: result.emailVerified,
        joinedEnterpriseName: result.joinedEnterpriseName,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Register error:", error);

    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}
