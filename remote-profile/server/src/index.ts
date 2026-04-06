import 'dotenv/config';
import os from 'node:os';
import express from 'express';
import cors from 'cors';
import api from './routes/api.js';

const app = express();
const PORT = Number(process.env.PORT) || 4050;
/** Bind address: `0.0.0.0` allows phones on the same LAN to reach the API. */
const HOST = process.env.HOST ?? '0.0.0.0';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'remote-profile' });
});

app.use('/api', api);

function listLanIPv4(): string[] {
  const out: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      const fam = a.family as string | number;
      const v4 = fam === 'IPv4' || fam === 4;
      if (v4 && !a.internal) {
        out.push(a.address);
      }
    }
  }
  return out;
}

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`remote-profile API http://127.0.0.1:${PORT} (this machine)`);
  if (HOST === '0.0.0.0' || HOST === '::') {
    for (const ip of listLanIPv4()) {
      // eslint-disable-next-line no-console
      console.log(`  same Wi‑Fi / LAN: http://${ip}:${PORT}`);
    }
    // eslint-disable-next-line no-console
    console.log(
      'Stop with Ctrl+C when done. Demo auth is weak — do not expose on untrusted networks.'
    );
  }
});
