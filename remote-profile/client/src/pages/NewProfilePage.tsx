import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createProfile } from '../api';
import { useAuth } from '../auth';

const EMPTY_DOC = `{
  "id": "my-device",
  "name": "My Device",
  "version": "1.0",
  "description": "Describe the emulated peripheral",
  "advertising": { "localName": "My_BLE" },
  "services": []
}`;

export default function NewProfilePage() {
  const { token } = useAuth();
  const nav = useNavigate();
  const [profileId, setProfileId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [notes, setNotes] = useState('');
  const [version, setVersion] = useState('1');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [docJson, setDocJson] = useState(EMPTY_DOC);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let document: Record<string, unknown>;
      try {
        document = JSON.parse(docJson) as Record<string, unknown>;
      } catch {
        throw new Error('Invalid JSON');
      }
      await createProfile(token, {
        profileId: profileId.trim(),
        name: name.trim(),
        category: category.trim(),
        notes: notes.trim() || undefined,
        document,
        version: version.trim(),
        status,
      });
      nav(`/profiles/${encodeURIComponent(profileId.trim())}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return null;
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <Link to="/" className="muted" style={{ fontSize: '0.9rem' }}>
            ← Profiles
          </Link>
          <h1 style={{ margin: '0.35rem 0 0' }}>New profile</h1>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="pid">Profile ID (stable id, e.g. heart-rate-monitor)</label>
          <input
            id="pid"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="cat">Category</label>
          <input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ver">Initial version label</label>
          <input id="ver" value={version} onChange={(e) => setVersion(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="doc">Profile JSON</label>
          <textarea
            id="doc"
            className="code"
            value={docJson}
            onChange={(e) => setDocJson(e.target.value)}
            spellCheck={false}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </form>
    </div>
  );
}
