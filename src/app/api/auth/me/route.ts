import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getCurrentUser());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication required." }, { status: 401 });
  }
}
