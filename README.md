# Where Are You

Where Are You is a real-time location sharing app built with Next.js.
Users get a personal link they can share so others can view their live location on a map.

## Features

- Real-time location sharing with browser geolocation
- Shareable profile links using dynamic routes: `/[username]`
- Live map rendering with Google Maps
- User status tracking: `active`, `idle`, `left`
- Basic profile data: display name, username, avatar URL
- Persistent storage using Cloudflare KV

## Main Use Cases

1. Open the home page and allow location access.
2. Get your generated username and share your personal link.
3. Another user opens your link to view your current location.
4. Your location and status update automatically while the app is open.

## Routes

- `/`
    - Home view for location sharing and map display.
- `/[username]`
    - Public profile/location page for a specific user.

## API

### `GET /api/location`

Returns active user locations.

Response (example):

```json
[
    {
        "username": "calm-fox-japan-42",
        "displayName": "Blue Sky",
        "avatarUrl": "https://example.com/avatar.png",
        "status": "active",
        "location": { "lat": 40.7128, "lng": -74.006 },
        "lastUpdated": "2026-03-26T11:20:00.000Z"
    }
]
```

### `POST /api/location`

Creates or updates user location/status.

Request body:

```json
{
    "username": "calm-fox-japan-42",
    "displayName": "Blue Sky",
    "avatarUrl": "https://example.com/avatar.png",
    "status": "active",
    "location": { "lat": 40.7128, "lng": -74.006 }
}
```

Response:

```json
{ "success": true }
```

### `GET /api/user?username=<username>`

Checks whether a user exists and returns profile details.

Response (example):

```json
{
    "exists": true,
    "user": {
        "username": "calm-fox-japan-42",
        "displayName": "Blue Sky",
        "status": "active",
        "location": { "lat": 40.7128, "lng": -74.006 },
        "lastUpdated": "2026-03-26T11:20:00.000Z"
    }
}
```

### `PUT /api/user`

Updates profile fields and optional status.

Request body:

```json
{
    "oldUsername": "calm-fox-japan-42",
    "newUsername": "calm-fox-japan-77",
    "displayName": "Blue Sky",
    "avatarUrl": "https://example.com/new-avatar.png",
    "status": "active"
}
```

Response:

```json
{
    "success": true,
    "user": {
        "username": "calm-fox-japan-77",
        "displayName": "Blue Sky",
        "status": "active",
        "location": { "lat": 40.7128, "lng": -74.006 },
        "lastUpdated": "2026-03-26T11:20:00.000Z"
    }
}
```

## Tech Stack

- Next.js 16
- React 19
- Tailwind CSS
- Google Maps (`@vis.gl/react-google-maps`)
- Cloudflare KV (data persistence)

## Environment Variables

Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_KV_NAMESPACE_ID=your_kv_namespace_id
CLOUDFLARE_KV_API_TOKEN=your_cloudflare_kv_api_token
```

## Getting Started

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Start production server:

```bash
npm start
```

Run lint:

```bash
npm run lint
```

## Notes and Limitations

- Location sharing requires browser geolocation permission.
- Geolocation generally requires HTTPS (or localhost in development).
- Location updates run on a fixed interval (currently 30 seconds).
- User idle status is time-based (currently 60 seconds without updates).
- Username is constrained to lowercase letters, numbers, and hyphens.
