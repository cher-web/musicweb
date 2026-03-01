import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/spotify";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/?error=no_code", req.url));
  }

  try {
    const data = await exchangeCode(code);

    if (!data.access_token) {
      return NextResponse.redirect(new URL("/?error=token_failed", req.url));
    }

    const response = NextResponse.redirect(new URL("/", req.url));

    response.cookies.set("spotify_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: data.expires_in,
      path: "/",
    });

    response.cookies.set("spotify_refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/?error=auth_failed", req.url));
  }
}
