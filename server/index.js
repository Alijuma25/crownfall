// ============================================================
// CROWNFALL — server/index.js
// Express + WebSocket server entry point.
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handleConnection } from './websocket/SocketHandler.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PORT       = process.env.PORT || 3001;
const CLIENT_DIR = path.join(__dirname, '..', 'client', 'dist');

const app  = express();
const http = createServer(app);
const wss  = new WebSocketServer({ server: http });

app.use(express.json());

// Serve built React client
app.use(express.static(CLIENT_DIR));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

// WebSocket
wss.on('connection', ws => {
  console.log('[WS] Client connected');
  handleConnection(ws);
});

// SPA fallback — all non-API routes serve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

http.listen(PORT, () => {
  console.log(`Crownfall running on http://localhost:${PORT}`);
});
