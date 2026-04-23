import nodemailer from "nodemailer";

type SendParams = {
  to: string;
  lat: number;
  lng: number;
  meetingLocation: string;
  meetingTime: string;
  distanceMeters: number;
  userName?: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (cachedTransporter) return cachedTransporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars"
    );
  }

  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return cachedTransporter;
}

export async function sendLocationEmail(params: SendParams): Promise<void> {
  const {
    to,
    lat,
    lng,
    meetingLocation,
    meetingTime,
    distanceMeters,
    userName,
  } = params;

  const who = userName?.trim() || "Someone";
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const sentAt = new Date().toISOString();
  const distanceStr =
    distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(2)} km`
      : `${Math.round(distanceMeters)} m`;

  const subject = `Safety Alert: ${who} hasn't arrived at ${meetingLocation}`;

  const text = [
    `Automated safety check-in.`,
    ``,
    `${who} had a meeting scheduled at "${meetingLocation}" at ${meetingTime},`,
    `but is currently ${distanceStr} away from that location.`,
    ``,
    `Current location: ${mapsUrl}`,
    `Coordinates: ${lat}, ${lng}`,
    `Sent at: ${sentAt}`,
    ``,
    `This email is sent automatically every few minutes until ${who}`,
    `either arrives at the meeting location or manually stops the alerts.`,
    `If you did not expect this message, please check on them.`,
  ].join("\n");

  const html = `
    <div style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
      <h2 style="color: #b91c1c; margin: 0 0 12px;">Safety Alert</h2>
      <p><strong>${who}</strong> had a meeting scheduled at
      <strong>${meetingLocation}</strong> at <strong>${meetingTime}</strong>,
      but is currently <strong>${distanceStr}</strong> away from that location.</p>
      <p><a href="${mapsUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Open current location in Google Maps</a></p>
      <p style="font-size: 13px; color: #555;">
        Coordinates: ${lat}, ${lng}<br/>
        Sent at: ${sentAt}
      </p>
      <hr style="border:none;border-top:1px solid #ddd;margin:16px 0"/>
      <p style="font-size: 12px; color: #666;">
        Automated safety check-in. Sent repeatedly until ${who} arrives or stops the alerts.
        If you did not expect this, please check on them.
      </p>
    </div>
  `;

  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject,
    text,
    html,
  });
}
