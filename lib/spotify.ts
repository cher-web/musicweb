import { NextRequest, NextResponse } from "next/server";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

function getRedirectUri(origin: string) {
  return `${origin}/api/auth/callback`;
}

function getBasicAuth() {
  return btoa(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  );
}

export function getAuthUrl(state: string, origin: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: "user-top-read streaming user-read-playback-state user-modify-playback-state",
    redirect_uri: getRedirectUri(origin),
    state,
    show_dialog: "true",
  });
  return `${SPOTIFY_AUTH_URL}?${params}`;
}

export async function exchangeCode(code: string, origin: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${getBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(origin),
    }),
  });
  if (!res.ok) throw new Error("Token exchange failed");
  return res.json();
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${getBasicAuth()}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error("Token refresh failed");
  return res.json();
}

async function fetchSpotifyApi(endpoint: string, accessToken: string) {
  const res = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

// Cookie helper: sets the access token cookie on a response
function setTokenCookie(
  response: NextResponse,
  accessToken: string,
  expiresIn: number
) {
  response.cookies.set("spotify_access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: expiresIn,
    path: "/",
  });
}

/**
 * Handles authenticated Spotify API requests with automatic token refresh.
 * Returns the API data as JSON, refreshing the access token cookie if needed.
 */
export async function authenticatedSpotifyRequest(
  req: NextRequest,
  endpoint: string
) {
  let accessToken = req.cookies.get("spotify_access_token")?.value;
  const refreshToken = req.cookies.get("spotify_refresh_token")?.value;

  if (!accessToken && !refreshToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // If access token is missing, refresh it
  if (!accessToken && refreshToken) {
    try {
      const tokenData = await refreshAccessToken(refreshToken);
      accessToken = tokenData.access_token;
      const data = await fetchSpotifyApi(endpoint, accessToken!);
      const response = NextResponse.json(data);
      setTokenCookie(response, tokenData.access_token, tokenData.expires_in);
      return response;
    } catch {
      return NextResponse.json(
        { error: "Authentication expired" },
        { status: 401 }
      );
    }
  }

  // Try with existing access token
  try {
    const data = await fetchSpotifyApi(endpoint, accessToken!);
    return NextResponse.json(data);
  } catch {
    // Access token may be expired — try refresh
    if (refreshToken) {
      try {
        const tokenData = await refreshAccessToken(refreshToken);
        const data = await fetchSpotifyApi(endpoint, tokenData.access_token);
        const response = NextResponse.json(data);
        setTokenCookie(response, tokenData.access_token, tokenData.expires_in);
        return response;
      } catch {
        return NextResponse.json(
          { error: "Authentication expired" },
          { status: 401 }
        );
      }
    }
    return NextResponse.json(
      { error: "Failed to fetch from Spotify" },
      { status: 500 }
    );
  }
}
