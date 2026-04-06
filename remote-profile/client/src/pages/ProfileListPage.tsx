import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProfiles, type StoredProfile } from '../api';
import { useAuth } from '../auth';

function isFullProfile(p: unknown): p is StoredProfile {
  return (
    typeof p === 'object' &&
    p !== null &&
    'versions' in p &&
    Array.isArray((p as StoredProfile).versions)
  );
}

export default function ProfileListPage() {
  const { token, logout } = useAuth();
  const [profiles, setProfiles] = useState<StoredProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { profiles: list } = await fetchProfiles(token);
        const full = list.filter(isFullProfile);
        if (!cancelled) {
          setProfiles(full);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <h1>Profiles</h1>
        <div className="row">
          <Link to="/new" className="btn btn-primary">
            New profile
          </Link>
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {profiles.map((p) => {
        const published = p.versions.filter((v) => v.status === 'published');
        const latest =
          published.length === 0
            ? null
            : published.reduce((a, b) => (a.version >= b.version ? a : b));
        return (
          <Link
            key={p.profileId}
            to={`/profiles/${encodeURIComponent(p.profileId)}`}
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div className="card">
              <h2>{p.name}</h2>
              <p className="muted">
                {p.profileId} · {p.category} · {p.versions.length} version(s)
                {latest && (
                  <>
                    {' '}
                    · latest published: <strong>v{latest.version}</strong>
                  </>
                )}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
