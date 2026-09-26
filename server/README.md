# Final Dayz Multiplayer Server

Phase 1 Socket.IO server for room creation, joining, disconnects, and lightweight two-player position sync.

## Local Development

```sh
npm install
npm run dev
```

The server defaults to `http://localhost:3001` and exposes:

```text
GET /health
GET /high-scores
POST /high-scores
```

Set `DATABASE_URL` to a Neon or Supabase Postgres connection string. The server creates the `high_scores` table automatically. Without `DATABASE_URL`, `/high-scores` returns 503 and the client uses its local cache.

Default local CORS origin:

```text
http://localhost:5173
```

## Render Deployment

Use these Render settings:

```text
Root Directory: server
Build Command: npm install && npm run build
Start Command: npm start
```

Environment variables:

```text
CLIENT_ORIGIN=https://zombie.baglini.co
DATABASE_URL=postgresql://USER:PASSWORD@HOST/finaldayz?sslmode=require
```

`CLIENT_ORIGIN` supports comma-separated values. To allow both production and local development against the same server:

```text
CLIENT_ORIGIN=https://zombie.baglini.co,http://localhost:5173
```

The server binds to `process.env.PORT`, which Render provides automatically.

## Smoke Test

- Start the server with `npm run dev`.
- Start the client from the project root with `npm run dev`.
- Open two browser tabs at `http://localhost:5173`.
- Create a co-op room in tab A.
- Join the room code in tab B.
- Confirm both player circles move in real time.
