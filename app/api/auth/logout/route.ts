import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL("/", req.url));
  response.cookies.delete("spotify_access_token");
  response.cookies.delete("spotify_refresh_token");
  return response;
}
