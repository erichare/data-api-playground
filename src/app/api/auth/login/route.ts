import { NextRequest, NextResponse } from "next/server";
import { isAuthEnabled, setAuthCookie, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ authenticated: true, disabled: true });
  }

  const body = (await req.json()) as { password?: string };
  if (!verifyPassword(body.password ?? "")) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  return setAuthCookie(NextResponse.json({ authenticated: true }));
}
