import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import LoginPage from './pages/LoginPage';
import ProfileListPage from './pages/ProfileListPage';
import ProfileDetailPage from './pages/ProfileDetailPage';
import ProfileEditPage from './pages/ProfileEditPage';
import NewProfilePage from './pages/NewProfilePage';

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <ProfileListPage />
          </Protected>
        }
      />
      <Route
        path="/new"
        element={
          <Protected>
            <NewProfilePage />
          </Protected>
        }
      />
      <Route
        path="/profiles/:profileId"
        element={
          <Protected>
            <ProfileDetailPage />
          </Protected>
        }
      />
      <Route
        path="/profiles/:profileId/v/:version"
        element={
          <Protected>
            <ProfileEditPage />
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
