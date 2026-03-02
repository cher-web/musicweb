import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/spotify";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const origin = new URL(req.url).origin;
  return NextResponse.redirect(getAuthUrl(state, origin));
}
