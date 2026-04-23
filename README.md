# Safe Meet Check-In

A location-based safety check-in app for meetings, dates, pickups, and other situations where someone wants a trusted contact to know if they do not arrive where expected.

Recommended repository name: `safe-meet-checkin`

Other good options:

- `safety-check-in`
- `meet-safe`
- `location-safety-alert`
- `geo-checkin-alert`

## What It Does

Safe Meet Check-In lets a user choose a meeting location, set an expected arrival time, and add a trusted contact email. When the time arrives, the app checks the user's current GPS position:

- If the user is inside the 1 km safe zone, alerts stop.
- If the user is outside the 1 km safe zone, the trusted contact receives an email with the user's current location.
- While the user remains outside the safe zone, the app keeps sending location emails every few minutes.
- When the user reaches the safe zone, the app stops the alerts automatically.

This is intended as a personal safety backup, not a replacement for calling emergency services.

## Features

- Google Maps location picker with place search
- 1 km safe-zone circle around the selected meeting point
- Browser geolocation tracking
- Scheduled check-in based on the selected time
- Emergency email alerts with live Google Maps coordinates
- Repeating email alerts until the user arrives or stops tracking
- Optional user name in alert emails
- Test mode that sends alerts every 30 seconds
- PWA support for installable/mobile-friendly usage
- Wake Lock support where available so the device is less likely to sleep during tracking

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Google Maps JavaScript API
- Nodemailer
- Gmail app passwords for outbound email
- `@ducanh2912/next-pwa` for PWA support

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.local.example .env.local
```

Fill in the values in `.env.local`:

```env
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-gmail-app-password
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your-google-maps-api-key
```

Run the development server:

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

## Environment Variables

`GMAIL_USER`

The Gmail account used to send alert emails.

`GMAIL_APP_PASSWORD`

A Gmail app password for the sending account. Do not use your normal Gmail password.

`NEXT_PUBLIC_GOOGLE_MAPS_KEY`

Google Maps browser API key. The key should have access to the Maps JavaScript API and Places API.

## Available Scripts

```bash
npm run dev
```

Starts the local development server.

```bash
npm run build
```

Builds the production app.

```bash
npm run start
```

Starts the production server after building.

```bash
npm run lint
```

Runs ESLint.

## How The Alert Flow Works

1. The user selects a meeting location on the map.
2. The app draws a 1 km safe zone around that location.
3. The user sets a meeting time and enters a trusted contact email.
4. The app starts watching the user's location.
5. At the selected time, the app compares the user's current position to the selected meeting location.
6. If the user is outside the safe zone, the app sends an email alert with their current coordinates and Google Maps link.
7. Alerts repeat until the user reaches the safe zone or stops tracking.

## Privacy And Safety Notes

- Location tracking runs in the browser and requires the user's permission.
- Alert emails are only sent after the selected check-in time if the user is outside the safe zone.
- Email credentials should only be stored in server-side environment variables.
- Never commit `.env.local` or real API keys to the repository.
- If credentials were committed by accident, rotate the Gmail app password and Google Maps API key before making the repo public.

## Deployment

This app can be deployed to platforms that support Next.js server routes, such as Vercel.

Before deploying:

- Add all required environment variables in the hosting provider.
- Restrict the Google Maps API key to your production domain.
- Use a dedicated Gmail account or email provider for alerts.
- Test the email route in production before relying on the app.

## Limitations

- Browser geolocation depends on device permissions, network conditions, GPS quality, and whether the browser allows background tracking.
- Wake Lock is not supported in every browser.
- Gmail has sending limits and may rate-limit high-volume usage.
- The current safe zone radius is fixed at 1 km.
