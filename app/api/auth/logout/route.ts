import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const response = NextResponse.redirect(
    new URL("/", process.env.NEXT_PUBLIC_BASE_URL!)
  );
  response.cookies.delete("spotify_access_token");
  response.cookies.delete("spotify_refresh_token");
  return response;
}
