export type Capabilities = {
  listProjects: boolean
  listDeployments: boolean
  redeploy: boolean
  logs: boolean
  envRead: boolean
  envWrite: boolean
  envValuesReadable: boolean
  notes: string[]
}

export type CredentialField = {
  name: string
  label: string
  secret: boolean
  required: boolean
  help?: string
  defaultValue?: string
  options?: string[]
}

export type ProviderInfo = {
  key: string
  name: string
  description: string
  credentials: CredentialField[]
  capabilities: Capabilities
}

export type Connection = {
  id: string
  provider: string
  providerName: string
  label: string
  accountName: string | null
  status: string
  statusMessage: string | null
  lastCheckedAt: string | null
  createdAt: string
  capabilities: Capabilities
}

export type Project = {
  id: string
  name: string
  url: string | null
  status: string | null
  region: string | null
  updatedAt: string | null
}

export type ServiceRow = {
  connectionId: string
  provider: string
  providerName: string
  connectionLabel: string
  accountName: string | null
  project: Project
}

export type OverviewError = {
  connectionId: string
  provider: string
  label: string
  message: string
}

export type Deployment = {
  id: string
  status: string | null
  url: string | null
  createdAt: string | null
  commitSha: string | null
  commitMessage: string | null
  branch: string | null
}

export type LogLine = {
  timestamp: string | null
  level: string | null
  message: string
}

export type EnvVar = {
  key: string
  value: string | null
  secret: boolean
  readable: boolean
  targets: string[]
}

export type AuthUser = {
  id: string
  email: string
  name: string | null
}

export type TelemetryError = {
  connectionId: string
  provider: string
  label: string
  message: string
}

export type FleetCell = {
  id: string
  name: string
  provider: string
  status: string | null
  state: 'nominal' | 'degraded' | 'fault'
}

export type FleetSummary = {
  total: number
  healthy: number
  degraded: number
  errorCount: number
  uptime: number | null
  providers: { name: string; count: number }[]
  connectionCount: number
  cells: FleetCell[]
  errors: TelemetryError[]
  services: ServiceRow[]
}

export type MeshService = ServiceRow & {
  latest: Deployment | null
  logSample: LogLine[]
}

export type ServiceMesh = {
  total: number
  nominal: number
  degraded: number
  errors: TelemetryError[]
  services: MeshService[]
}

export type BoardDeployment = Deployment & {
  connectionId: string
  projectId: string
  projectName: string
  provider: string
  providerName: string
  durationMs: number | null
}

export type DeploymentBoard = {
  inFlight: number
  queued: number
  history: BoardDeployment[]
  errors: TelemetryError[]
  projects: ServiceRow[]
}

export type TailLine = LogLine & {
  provider: string
  providerName: string
  projectName: string
  connectionId: string
  projectId: string
  deploymentId: string
}

export type LogTail = {
  total: number
  levels: { info: number; warn: number; error: number; debug: number; other: number }
  linesPerSec: number | null
  lines: TailLine[]
  errors: TelemetryError[]
}

export type VaultVariable = EnvVar & {
  connectionId: string
  projectId: string
  projectName: string
  provider: string
  providerName: string
  canWrite: boolean
}

export type VaultSnapshot = {
  total: number
  readable: number
  masked: number
  driftCount: number
  drifts: { connectionId: string; key: string; reason: 'missing' | 'mismatch' }[]
  variables: VaultVariable[]
  errors: TelemetryError[]
  projects: ServiceRow[]
}

export type ActivityEvent = {
  at: string | null
  kind: string
  title: string
  detail: string
  connectionId: string
  projectId: string | null
}
