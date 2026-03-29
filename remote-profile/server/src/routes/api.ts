import { Router } from 'express';
import type { AppStore, ProfileVersionRecord, StoredProfile } from '../types.js';
import { readStore, writeStore } from '../store.js';
import {
  assertValidSession,
  createSession,
  findUserByEmail,
  getAuthUser,
  verifyPassword,
} from '../auth.js';
import { compareVersion } from '../versionSort.js';
import { findVersion, pickLatestPublished } from '../profileHelpers.js';

const router = Router();

function sendError(res: import('express').Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

router.post('/auth/login', (req, res) => {
  const email = String(req.body?.email ?? '');
  const password = String(req.body?.password ?? '');
  const store = readStore();
  const user = findUserByEmail(store, email);
  if (!user || !verifyPassword(user, password)) {
    return sendError(res, 401, 'Invalid email or password');
  }
  const token = createSession(user.id);
  res.json({ token, email: user.email });
});

/**
 * With `Authorization: Bearer …`: full profile records (admin).
 * Without auth: public catalog — profiles that have a published version (peripheral / demos).
 */
router.get('/profiles', (req, res) => {
  const store = readStore();
  const user = getAuthUser(req.headers.authorization);
  if (user) {
    return res.json({ profiles: store.profiles });
  }
  const profiles = store.profiles
    .map((p) => {
      const latest = pickLatestPublished(p);
      if (!latest) {
        return null;
      }
      return {
        profileId: p.profileId,
        name: p.name,
        category: p.category,
        latestPublishedVersion: latest.version,
        updatedAt: latest.updatedAt,
      };
    })
    .filter(Boolean);
  res.json({ profiles });
});

/** Public: latest published device document for a profile id (peripheral consumer). */
router.get('/profiles/:profileId/latest', (req, res) => {
  const store = readStore();
  const p = store.profiles.find((x) => x.profileId === req.params.profileId);
  if (!p) {
    return sendError(res, 404, 'Profile not found');
  }
  const latest = pickLatestPublished(p);
  if (!latest) {
    return sendError(res, 404, 'No published version');
  }
  res.json({
    profileId: p.profileId,
    version: latest.version,
    updatedAt: latest.updatedAt,
    profile: latest.document,
  });
});

router.get('/profiles/:profileId', (req, res) => {
  try {
    assertValidSession(req.headers.authorization);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 401;
    return sendError(res, status, 'Unauthorized');
  }
  const store = readStore();
  const p = store.profiles.find((x) => x.profileId === req.params.profileId);
  if (!p) {
    return sendError(res, 404, 'Profile not found');
  }
  res.json(p);
});

router.get('/profiles/:profileId/versions', (req, res) => {
  try {
    assertValidSession(req.headers.authorization);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 401;
    return sendError(res, status, 'Unauthorized');
  }
  const store = readStore();
  const p = store.profiles.find((x) => x.profileId === req.params.profileId);
  if (!p) {
    return sendError(res, 404, 'Profile not found');
  }
  res.json({
    versions: p.versions.map((v) => ({
      version: v.version,
      status: v.status,
      updatedAt: v.updatedAt,
      changelog: v.changelog,
    })),
  });
});

router.post('/profiles', (req, res) => {
  try {
    assertValidSession(req.headers.authorization);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 401;
    return sendError(res, status, 'Unauthorized');
  }
  const profileId = String(req.body?.profileId ?? '').trim();
  const name = String(req.body?.name ?? '').trim();
  const category = String(req.body?.category ?? 'general').trim();
  const notes = req.body?.notes != null ? String(req.body.notes) : undefined;
  const document = req.body?.document;
  const version = String(req.body?.version ?? '1').trim();
  const status = req.body?.status === 'published' ? 'published' : 'draft';

  if (!profileId || !name) {
    return sendError(res, 400, 'profileId and name are required');
  }
  if (!document || typeof document !== 'object') {
    return sendError(res, 400, 'document must be a JSON object');
  }

  const store = readStore();
  if (store.profiles.some((p) => p.profileId === profileId)) {
    return sendError(res, 409, 'profileId already exists');
  }

  const row: ProfileVersionRecord = {
    version,
    status,
    updatedAt: new Date().toISOString(),
    changelog: req.body?.changelog ? String(req.body.changelog) : undefined,
    document: { ...document, id: profileId },
  };

  const created: StoredProfile = {
    profileId,
    name,
    category,
    notes,
    versions: [row],
  };
  store.profiles.push(created);
  writeStore(store);
  res.status(201).json(created);
});

router.put('/profiles/:profileId/:version', (req, res) => {
  try {
    assertValidSession(req.headers.authorization);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 401;
    return sendError(res, status, 'Unauthorized');
  }
  const { profileId, version } = req.params;
  const store = readStore();
  const p = store.profiles.find((x) => x.profileId === profileId);
  if (!p) {
    return sendError(res, 404, 'Profile not found');
  }
  const row = findVersion(p, version);
  if (!row) {
    return sendError(res, 404, 'Version not found');
  }

  if (req.body?.document != null) {
    if (typeof req.body.document !== 'object') {
      return sendError(res, 400, 'document must be an object');
    }
    row.document = { ...req.body.document, id: profileId };
  }
  if (req.body?.status === 'draft' || req.body?.status === 'published') {
    row.status = req.body.status;
  }
  if (req.body?.changelog !== undefined) {
    row.changelog = String(req.body.changelog);
  }
  if (req.body?.metadata !== undefined && typeof req.body.metadata === 'object') {
    row.metadata = req.body.metadata as Record<string, unknown>;
  }
  if (req.body?.name != null) {
    p.name = String(req.body.name);
  }
  if (req.body?.category != null) {
    p.category = String(req.body.category);
  }
  if (req.body?.notes !== undefined) {
    p.notes = req.body.notes === null ? undefined : String(req.body.notes);
  }
  row.updatedAt = new Date().toISOString();
  writeStore(store);
  res.json(p);
});

router.post('/profiles/:profileId/:version/clone', (req, res) => {
  try {
    assertValidSession(req.headers.authorization);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 401;
    return sendError(res, status, 'Unauthorized');
  }
  const { profileId, version } = req.params;
  const targetVersion = String(req.body?.targetVersion ?? '').trim();
  if (!targetVersion) {
    return sendError(res, 400, 'targetVersion is required');
  }

  const store = readStore();
  const p = store.profiles.find((x) => x.profileId === profileId);
  if (!p) {
    return sendError(res, 404, 'Profile not found');
  }
  const source = findVersion(p, version);
  if (!source) {
    return sendError(res, 404, 'Version not found');
  }
  if (findVersion(p, targetVersion)) {
    return sendError(res, 409, 'targetVersion already exists');
  }

  const clone: ProfileVersionRecord = {
    version: targetVersion,
    status: 'draft',
    updatedAt: new Date().toISOString(),
    changelog: req.body?.changelog ? String(req.body.changelog) : `Cloned from ${version}`,
    document: JSON.parse(JSON.stringify(source.document)),
    metadata: source.metadata ? { ...source.metadata } : undefined,
  };
  (clone.document as Record<string, unknown>).id = profileId;
  p.versions.push(clone);
  p.versions.sort((a, b) => compareVersion(a.version, b.version));
  writeStore(store);
  res.status(201).json(p);
});

router.delete('/profiles/:profileId/:version', (req, res) => {
  try {
    assertValidSession(req.headers.authorization);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 401;
    return sendError(res, status, 'Unauthorized');
  }
  const { profileId, version } = req.params;
  const store = readStore();
  const idxP = store.profiles.findIndex((x) => x.profileId === profileId);
  if (idxP < 0) {
    return sendError(res, 404, 'Profile not found');
  }
  const p = store.profiles[idxP]!;
  const idxV = p.versions.findIndex((v) => v.version === version);
  if (idxV < 0) {
    return sendError(res, 404, 'Version not found');
  }
  p.versions.splice(idxV, 1);
  if (p.versions.length === 0) {
    store.profiles.splice(idxP, 1);
  }
  writeStore(store);
  res.status(204).send();
});

router.delete('/profiles/:profileId', (req, res) => {
  try {
    assertValidSession(req.headers.authorization);
  } catch (e) {
    const status = (e as Error & { status?: number }).status ?? 401;
    return sendError(res, status, 'Unauthorized');
  }
  const store = readStore();
  const idx = store.profiles.findIndex((x) => x.profileId === req.params.profileId);
  if (idx < 0) {
    return sendError(res, 404, 'Profile not found');
  }
  store.profiles.splice(idx, 1);
  writeStore(store);
  res.status(204).send();
});

export default router;
