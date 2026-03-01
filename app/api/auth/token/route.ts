import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/spotify";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  let accessToken = req.cookies.get("spotify_access_token")?.value;
  const refreshToken = req.cookies.get("spotify_refresh_token")?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!accessToken && refreshToken) {
    try {
      const tokenData = await refreshAccessToken(refreshToken);
      const response = NextResponse.json({
        access_token: tokenData.access_token,
      });
      response.cookies.set("spotify_access_token", tokenData.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: tokenData.expires_in,
        path: "/",
      });
      return response;
    } catch {
      return NextResponse.json(
        { error: "Token refresh failed" },
        { status: 401 }
      );
    }
  }

  return NextResponse.json({ access_token: accessToken });
}
