import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OverviewPage from './pages/OverviewPage'
import ServicesPage from './pages/ServicesPage'
import DeploymentsPage from './pages/DeploymentsPage'
import LogsPage from './pages/LogsPage'
import SecretsPage from './pages/SecretsPage'
import ConnectorsPage from './pages/ConnectorsPage'

function Shell({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<Shell><OverviewPage /></Shell>} />
      <Route path="/services" element={<Shell><ServicesPage /></Shell>} />
      <Route path="/deployments" element={<Shell><DeploymentsPage /></Shell>} />
      <Route path="/logs" element={<Shell><LogsPage /></Shell>} />
      <Route path="/secrets" element={<Shell><SecretsPage /></Shell>} />
      <Route path="/connectors" element={<Shell><ConnectorsPage /></Shell>} />
      <Route path="/connections" element={<Navigate to="/connectors" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
