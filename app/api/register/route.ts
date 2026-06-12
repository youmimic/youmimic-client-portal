// app/api/register/route.ts
import { NextResponse } from "next/server";
import { registerUser } from "@/lib/auth/register-user";

export async function POST(req: Request) {
  try {
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
        message:
          "User registered successfully. Please verify your email. Make sure to check the spam folder.",
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
