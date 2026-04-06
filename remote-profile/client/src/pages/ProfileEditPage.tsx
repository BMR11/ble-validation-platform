import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  cloneProfileVersion,
  deleteProfileVersion,
  fetchProfileDetail,
  updateProfileVersion,
  type StoredProfile,
} from '../api';
import { useAuth } from '../auth';

export default function ProfileEditPage() {
  const { profileId: rawPid, version: rawVer } = useParams();
  const profileId = rawPid ? decodeURIComponent(rawPid) : '';
  const version = rawVer ? decodeURIComponent(rawVer) : '';
  const { token } = useAuth();
  const nav = useNavigate();

  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [docJson, setDocJson] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [changelog, setChangelog] = useState('');
  const [profileName, setProfileName] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !profileId || !version) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchProfileDetail(token, profileId);
        if (cancelled) {
          return;
        }
        setProfile(p);
        setProfileName(p.name);
        setCategory(p.category);
        setNotes(p.notes ?? '');
        const row = p.versions.find((v) => v.version === version);
        if (!row) {
          setError('Version not found');
          return;
        }
        setStatus(row.status);
        setChangelog(row.changelog ?? '');
        setDocJson(JSON.stringify(row.document, null, 2));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Load failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, profileId, version]);

  async function onSave(e: React.FormEvent) {
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
        throw new Error('Invalid JSON in profile document');
      }
      await updateProfileVersion(token, profileId, version, {
        document,
        status,
        changelog,
        name: profileName,
        category,
        notes: notes || null,
      });
      nav(`/profiles/${encodeURIComponent(profileId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function onClone() {
    if (!token) {
      return;
    }
    const target = window.prompt('New version label (e.g. 4):');
    if (!target?.trim()) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cloneProfileVersion(token, profileId, version, target.trim());
      nav(`/profiles/${encodeURIComponent(profileId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clone failed');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!token || !window.confirm(`Delete version ${version}?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteProfileVersion(token, profileId, version);
      nav(`/profiles/${encodeURIComponent(profileId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
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
          <Link
            to={`/profiles/${encodeURIComponent(profileId)}`}
            className="muted"
            style={{ fontSize: '0.9rem' }}
          >
            ← {profile?.name ?? profileId}
          </Link>
          <h1 style={{ margin: '0.35rem 0 0' }}>
            Edit v{version}
          </h1>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={onClone} disabled={busy}>
            Clone to new version
          </button>
          <button type="button" className="btn btn-danger" onClick={onDelete} disabled={busy}>
            Delete version
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <form className="card" onSubmit={onSave}>
        <div className="field">
          <label htmlFor="pname">Display name</label>
          <input
            id="pname"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
          />
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
          <label htmlFor="cl">Changelog</label>
          <input id="cl" value={changelog} onChange={(e) => setChangelog(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="doc">Profile JSON (device document)</label>
          <textarea
            id="doc"
            className="code"
            value={docJson}
            onChange={(e) => setDocJson(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <Link className="btn btn-ghost" to={`/profiles/${encodeURIComponent(profileId)}`}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
