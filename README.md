# Final Dayz

A browser-based top-down zombie defense shooter built with Vite, TypeScript, and Phaser 3.

## Local Development

Run the multiplayer server in one terminal:

```sh
cd server
npm run dev
```

Run the client in another terminal from the project root:

```sh
npm run dev
```

Local URLs:

```text
Client: http://localhost:5173
Server: http://localhost:3001
Health check: http://localhost:3001/health
```

Single-player does not require the multiplayer server.

## Environment Variables

Client `.env`:

```text
VITE_SOCKET_URL=http://localhost:3001
```

For Render production, set:

```text
VITE_SOCKET_URL=https://<server-render-url>
```

Server `.env`:

```text
PORT=3001
CLIENT_ORIGIN=http://localhost:5173,https://zombie.baglini.co
DATABASE_URL=postgresql://USER:PASSWORD@HOST/finaldayz?sslmode=require
```

On Render, `PORT` is provided automatically. `DATABASE_URL` should point at a free Neon or Supabase Postgres database so high scores survive across browsers and friends.

### Shared High Scores

The client still caches the top 5 in `localStorage`. The live board is stored in Postgres on the multiplayer server.

1. Create a free Neon project at [neon.tech](https://neon.tech) (Supabase works the same way).
2. Copy the connection string into `server/.env` as `DATABASE_URL`.
3. Add the same `DATABASE_URL` to the Render web service.
4. The server creates the `high_scores` table on boot.

Endpoints:

```text
GET  /high-scores
POST /high-scores
```

If the database is missing or the free Render service is asleep, the game falls back to the local cache and retries qualifying local scores on the next successful sync.

## Render Deployment

### Client Static Site

Use these Render settings:

```text
Type: Static Site
Root Directory: project root
Build Command: npm install && npm run build
Publish Directory: dist
```

Environment variables:

```text
VITE_SOCKET_URL=https://<server-render-url>
```

Custom domain:

```text
zombie.baglini.co
```

### Multiplayer Server Web Service

Use these Render settings:

```text
Type: Web Service
Root Directory: server
Build Command: npm install && npm run build
Start Command: npm start
```

Environment variables:

```text
CLIENT_ORIGIN=https://zombie.baglini.co
DATABASE_URL=postgresql://USER:PASSWORD@HOST/finaldayz?sslmode=require
```

If you also want to allow local testing against the deployed server, use a comma-separated list:

```text
CLIENT_ORIGIN=https://zombie.baglini.co,http://localhost:5173
```

## Multiplayer Smoke Test

### Local Test

- Start the server with `cd server && npm run dev`.
- Start the client with `npm run dev`.
- Open `http://localhost:5173` in two browser tabs.
- Create a co-op room in tab A.
- Join that room code in tab B.
- Confirm both player circles move in real time.

### Production Test

- Open `https://zombie.baglini.co`.
- Create a co-op room in browser A.
- Join that room from browser B or another computer.
- Confirm both player circles move in real time.
- Refresh one player and confirm disconnect/rejoin behavior is reasonable.
- Confirm single-player still works if the multiplayer server is unavailable.

## Multiplayer Scope

Current multiplayer is Phase 1 player presence only. It syncs room membership and player position/rotation. Zombies, bullets, barricades, waves, shop, health, score, and cash are still local gameplay systems and are not synced yet.
