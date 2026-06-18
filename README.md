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
```

On Render, `PORT` is provided automatically.

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
