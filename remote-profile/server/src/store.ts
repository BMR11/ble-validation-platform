import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppStore } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const SEED_PATH = path.join(__dirname, '..', 'seed', 'initial-store.json');

function ensureStoreFile(): void {
  if (fs.existsSync(STORE_PATH)) {
    return;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const seed = fs.readFileSync(SEED_PATH, 'utf8');
  fs.writeFileSync(STORE_PATH, seed, 'utf8');
}

export function readStore(): AppStore {
  ensureStoreFile();
  const raw = fs.readFileSync(STORE_PATH, 'utf8');
  return JSON.parse(raw) as AppStore;
}

export function writeStore(store: AppStore): void {
  ensureStoreFile();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}
