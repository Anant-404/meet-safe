import { sendLocationEmail } from "@/lib/email";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const RATE_LIMIT_MS = 60_000;
const recentSends = new Map<string, number>();

type Body = {
  to?: unknown;
  lat?: unknown;
  lng?: unknown;
  meetingLocation?: unknown;
  meetingTime?: unknown;
  distanceMeters?: unknown;
  userName?: unknown;
};

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function jsonError(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status });
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonError("Invalid JSON body");
  }

  const {
    to,
    lat,
    lng,
    meetingLocation,
    meetingTime,
    distanceMeters,
    userName,
  } = body;

  if (typeof to !== "string" || !isValidEmail(to)) {
    return jsonError("Invalid recipient email");
  }
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return jsonError("Invalid coordinates");
  }
  if (typeof meetingLocation !== "string" || !meetingLocation.trim()) {
    return jsonError("Invalid meeting location");
  }
  if (typeof meetingTime !== "string" || !meetingTime.trim()) {
    return jsonError("Invalid meeting time");
  }
  if (typeof distanceMeters !== "number" || Number.isNaN(distanceMeters)) {
    return jsonError("Invalid distance");
  }
  if (userName !== undefined && typeof userName !== "string") {
    return jsonError("Invalid userName");
  }

  const now = Date.now();
  const last = recentSends.get(to);
  if (last !== undefined && now - last < RATE_LIMIT_MS) {
    return jsonError(
      `Rate limited. Try again in ${Math.ceil(
        (RATE_LIMIT_MS - (now - last)) / 1000
      )}s`,
      429
    );
  }

  try {
    await sendLocationEmail({
      to,
      lat,
      lng,
      meetingLocation: meetingLocation.slice(0, 200),
      meetingTime: meetingTime.slice(0, 100),
      distanceMeters,
      userName: userName?.slice(0, 80),
    });
    recentSends.set(to, now);
    return Response.json({ success: true });
  } catch (err) {
    console.error("sendLocationEmail failed", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonError(`Email send failed: ${msg}`, 500);
  }
}
