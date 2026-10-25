import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OverviewPage from './pages/OverviewPage'
import ConnectionsPage from './pages/ConnectionsPage'
import ProjectPage from './pages/ProjectPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout>
              <OverviewPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/connections"
        element={
          <ProtectedRoute>
            <Layout>
              <ConnectionsPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/connections/:connectionId/projects/:projectId"
        element={
          <ProtectedRoute>
            <Layout>
              <ProjectPage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
