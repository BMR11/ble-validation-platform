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
import { IconCancel, IconRemove, IconSave, IconSpinner } from '../components/actionIcons';
import ConfirmDialog from '../components/ConfirmDialog';
import ProfileDragDropBuilder from '../components/ProfileDragDropBuilder';

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [docTab, setDocTab] = useState<'builder' | 'json'>('builder');
  const [builderMountKey, setBuilderMountKey] = useState(0);

  function setDocTabSafe(next: 'builder' | 'json') {
    if (next === 'builder' && docTab === 'json') {
      setBuilderMountKey((k) => k + 1);
    }
    setDocTab(next);
  }

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
    if (!token) {
      return;
    }
    setConfirmDelete(false);
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
    <div className="app-shell edit-page">
      <form onSubmit={onSave}>
        <div className="topbar">
          <div>
            <Link
              to={`/profiles/${encodeURIComponent(profileId)}`}
              className="muted"
              style={{ fontSize: '0.9rem' }}
            >
              ← {profile?.name ?? profileId}
            </Link>
            <h1 style={{ margin: '0.35rem 0 0' }}>Edit v{version}</h1>
          </div>
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={onClone} disabled={busy}>
              Clone
            </button>
            <button
              type="button"
              className="btn btn-danger icon-btn"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              aria-label="Delete"
              title="Delete"
            >
              <IconRemove />
            </button>
            <button
              type="submit"
              className="btn btn-primary icon-btn"
              disabled={busy}
              aria-label={busy ? 'Saving' : 'Save'}
              title={busy ? 'Saving' : 'Save'}
            >
              {busy ? <IconSpinner /> : <IconSave />}
            </button>
            <Link
              className="btn btn-ghost icon-btn"
              to={`/profiles/${encodeURIComponent(profileId)}`}
              aria-label="Cancel"
              title="Cancel"
            >
              <IconCancel />
            </Link>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <section className="builder-panel panel-library">
          <header className="builder-panel-head">
            <h2>Library</h2>
            <p>How this version is listed. This is not part of the BLE profile.</p>
          </header>
          <div className="builder-panel-body">
            <div className="field-grid">
              <div className="field">
                <label htmlFor="pname">Display name</label>
                <input id="pname" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cat">Category</label>
                <input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} />
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
            </div>
            <div className="field">
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </section>
        <section className="builder-panel panel-document">
          <header className="builder-panel-head">
            <h2>Profile</h2>
            <div className="doc-tabs" role="tablist" aria-label="Profile document">
              <button
                type="button"
                role="tab"
                aria-selected={docTab === 'builder'}
                className={docTab === 'builder' ? 'btn btn-primary' : 'btn btn-ghost'}
                onClick={() => setDocTabSafe('builder')}
              >
                Visual builder
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={docTab === 'json'}
                className={docTab === 'json' ? 'btn btn-primary' : 'btn btn-ghost'}
                onClick={() => setDocTabSafe('json')}
              >
                JSON
              </button>
            </div>
          </header>
          <div className="builder-panel-body">
            {docTab === 'builder' ? (
              docJson ? (
                <ProfileDragDropBuilder
                  key={builderMountKey}
                  docJson={docJson}
                  onDocJsonChange={setDocJson}
                />
              ) : (
                <p className="muted">{error ? 'Profile document did not load.' : 'Loading profile…'}</p>
              )
            ) : (
              <textarea
                id="doc"
                className="code"
                value={docJson}
                onChange={(e) => setDocJson(e.target.value)}
                spellCheck={false}
                aria-label="Profile JSON"
              />
            )}
          </div>
        </section>
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete version"
        message={`Delete version ${version}?`}
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          void onDelete();
        }}
      />
    </div>
  );
}
