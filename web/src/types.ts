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
