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
CLIENT_ORIGIN=<deployed client URL>
```

The server binds to `process.env.PORT`, which Render provides automatically.
