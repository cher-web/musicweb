import { NextRequest } from "next/server";
import { authenticatedSpotifyRequest } from "@/lib/spotify";

export const runtime = "edge";

const VALID_TIME_RANGES = ["short_term", "medium_term", "long_term"];

export async function GET(req: NextRequest) {
  const timeRange = req.nextUrl.searchParams.get("time_range");
  const range = VALID_TIME_RANGES.includes(timeRange ?? "")
    ? timeRange
    : "medium_term";

  return authenticatedSpotifyRequest(
    req,
    `/me/top/tracks?limit=20&time_range=${range}`
  );
}
