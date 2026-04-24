import nodemailer from "nodemailer";

type SendParams = {
  to: string; lat: number; lng: number;
  meetingLocation: string; meetingTime: string;
  distanceMeters: number; userName?: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD");
  cachedTransporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  return cachedTransporter;
}

export async function sendLocationEmail(params: SendParams): Promise<void> {
  const { to, lat, lng, meetingLocation, meetingTime, distanceMeters, userName } = params;
  const who = userName?.trim() || "Someone";
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const sentAt = new Date().toLocaleString();
  const dist = distanceMeters >= 1000 ? `${(distanceMeters/1000).toFixed(2)} km` : `${Math.round(distanceMeters)} m`;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;background:#f4f7f5;border-radius:16px;overflow:hidden;border:1px solid #d0e4da;">
      <div style="background:#0ea472;padding:22px 26px;">
        <div style="color:white;font-size:18px;font-weight:600;">SafetyNet Alert</div>
        <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:3px;">Automated safety check-in</div>
      </div>
      <div style="padding:22px 26px;">
        <p style="margin:0 0 14px;font-size:14px;color:#0d1f17;line-height:1.6;">
          <strong>${who}</strong> had a meeting at <strong>${meetingLocation}</strong> at <strong>${meetingTime}</strong>,
          but is currently <strong style="color:#0ea472;">${dist} away</strong>.
        </p>
        <a href="${mapsUrl}" style="display:inline-block;background:#0ea472;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;margin-bottom:18px;">
          View current location
        </a>
        <div style="background:#e8f2ec;border-radius:8px;padding:12px 14px;font-size:12px;color:#4a6e5a;">
          <div>Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}</div>
          <div style="margin-top:3px;">Sent at: ${sentAt}</div>
        </div>
      </div>
      <div style="padding:14px 26px;border-top:1px solid #d0e4da;font-size:11px;color:#7a9088;">
        Alerts repeat until ${who} arrives or stops the session.
      </div>
    </div>`;

  const text = `SafetyNet Alert\n\n${who} hasn't arrived at "${meetingLocation}" at ${meetingTime}, but is ${dist} away.\n\nLocation: ${mapsUrl}\nSent: ${sentAt}`;

  await getTransporter().sendMail({
    from: `SafetyNet <${process.env.GMAIL_USER}>`,
    to, subject: `SafetyNet: ${who} hasn't arrived at ${meetingLocation}`,
    text, html,
  });
}