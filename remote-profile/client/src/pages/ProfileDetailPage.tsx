import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteProfile, fetchProfileDetail, type StoredProfile } from '../api';
import { useAuth } from '../auth';

export default function ProfileDetailPage() {
  const { profileId: rawId } = useParams();
  const profileId = rawId ? decodeURIComponent(rawId) : '';
  const { token } = useAuth();
  const nav = useNavigate();
  const [p, setP] = useState<StoredProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !profileId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchProfileDetail(token, profileId);
        if (!cancelled) {
          setP(data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Load failed');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, profileId]);

  if (!token) {
    return null;
  }

  async function onDeleteProfile() {
    if (!token || !p || !window.confirm(`Delete entire profile "${p.profileId}"?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteProfile(token, p.profileId);
      nav('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <Link to="/" className="muted" style={{ fontSize: '0.9rem' }}>
            ← Profiles
          </Link>
          <h1 style={{ margin: '0.35rem 0 0' }}>{p?.name ?? profileId}</h1>
        </div>
        {p && (
          <button type="button" className="btn btn-danger" disabled={busy} onClick={onDeleteProfile}>
            Delete profile
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {p && (
        <>
          <div className="card">
            <p className="muted" style={{ marginTop: 0 }}>
              <strong>ID</strong> {p.profileId} · <strong>Category</strong> {p.category}
            </p>
            {p.notes && <p>{p.notes}</p>}
          </div>
          <h2 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem' }}>Versions</h2>
          {[...p.versions]
            .sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }))
            .map((v) => (
              <div key={v.version} className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>v{v.version}</strong>{' '}
                    <span
                      className={
                        v.status === 'published' ? 'badge badge-published' : 'badge badge-draft'
                      }
                    >
                      {v.status}
                    </span>
                    <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                      Updated {new Date(v.updatedAt).toLocaleString()}
                    </p>
                    {v.changelog && (
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.9rem' }}>{v.changelog}</p>
                    )}
                  </div>
                  <Link
                    className="btn btn-primary"
                    to={`/profiles/${encodeURIComponent(p.profileId)}/v/${encodeURIComponent(v.version)}`}
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
        </>
      )}
    </div>
  );
}
