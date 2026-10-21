export type HealthStatus = {
  status: string
  service: string
  version: string
}

const API_BASE_URL = 'http://localhost:8000'

let csrfToken: string | null = null

export type AuthUser = {
  authenticated: boolean
  username: string
  csrf_token: string
  expires_in?: number
}

async function getErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const errorData = await response.json().catch(() => null)

  if (typeof errorData?.detail === 'string') {
    return errorData.detail
  }

  return fallback
}

// -------------------- AUTHENTICATION-AWARE FETCH --------------------

async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (
    csrfToken &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  ) {
    headers.set('X-CSRF-Token', csrfToken)
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  })
}

// -------------------- AUTHENTICATION --------------------

export async function checkAuth(): Promise<AuthUser | null> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    credentials: 'include',
  })

  if (response.status === 401 || response.status === 403) {
    csrfToken = null
    return null
  }

  if (!response.ok) {
    throw new Error('Could not verify the login session')
  }

  const user = (await response.json()) as AuthUser
  csrfToken = user.csrf_token

  return user
}

export async function login(
  username: string,
  password: string,
): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Login failed. Please check your credentials.',
      ),
    )
  }

  const user = (await response.json()) as AuthUser
  csrfToken = user.csrf_token

  return user
}

export async function logout(): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not log out'),
    )
  }

  csrfToken = null
}

// -------------------- GENERAL --------------------

export async function getHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE_URL}/health`)

  if (!response.ok) {
    throw new Error('Backend health check failed')
  }

  return response.json() as Promise<HealthStatus>
}

// -------------------- PROJECTS --------------------

export type Project = {
  id: number
  name: string
  location: string
  project_type: string
  progress: number
  budget: number
  actual_expenditure: number
}

export type ProjectCreate = {
  name: string
  location: string
  project_type: string
  progress: number
  budget: number
  actual_expenditure: number
}

export type ProjectUpdate = ProjectCreate

export async function getProjects(): Promise<Project[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/projects`)

  if (!response.ok) {
    throw new Error('Could not fetch projects')
  }

  return response.json() as Promise<Project[]>
}

export async function createProject(
  project: ProjectCreate,
): Promise<Project> {
  const response = await apiFetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Could not create project. Check the submitted details.',
      ),
    )
  }

  return response.json() as Promise<Project>
}

export async function updateProject(
  projectId: number,
  project: ProjectUpdate,
): Promise<Project> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/projects/${projectId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Could not update project. Check the submitted details.',
      ),
    )
  }

  return response.json() as Promise<Project>
}

// -------------------- WORKFORCE --------------------

export type Worker = {
  id: number
  project_id: number
  project_name?: string
  name: string
  role: string
  daily_wage: number
  phone: string | null
}

export type WorkerCreate = {
  project_id: number
  name: string
  role: string
  daily_wage: number
  phone: string | null
}

export type WorkerUpdate = WorkerCreate

export type AttendanceStatus =
  | 'Present'
  | 'Absent'
  | 'Half-day'
  | 'Leave'

export type Attendance = {
  id: number
  worker_id: number
  worker_name?: string
  role?: string
  daily_wage?: number
  project_id?: number
  project_name?: string
  attendance_date: string
  hours_worked: number
  status: AttendanceStatus
  notes: string | null
  labour_cost: number
}

export type AttendanceCreate = {
  worker_id: number
  attendance_date: string
  hours_worked: number
  status: AttendanceStatus
  notes: string | null
}

export type WorkforceSummary = {
  worker_count: number
  attendance_records: number
  total_hours: number
  labour_cost: number
  present_count: number
  absent_count: number
  half_day_count: number
  leave_count: number
}

export async function getWorkers(
  projectId?: number,
): Promise<Worker[]> {
  const query = projectId ? `?project_id=${projectId}` : ''
  const response = await apiFetch(
    `${API_BASE_URL}/api/workers${query}`,
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not fetch workers'),
    )
  }

  return response.json() as Promise<Worker[]>
}

export async function createWorker(
  worker: WorkerCreate,
): Promise<Worker> {
  const response = await apiFetch(`${API_BASE_URL}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(worker),
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not add worker'),
    )
  }

  return response.json() as Promise<Worker>
}

export async function updateWorker(
  workerId: number,
  worker: WorkerUpdate,
): Promise<Worker> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/workers/${workerId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(worker),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not update worker'),
    )
  }

  return response.json() as Promise<Worker>
}

export async function getAttendance(options?: {
  projectId?: number
  startDate?: string
  endDate?: string
}): Promise<Attendance[]> {
  const params = new URLSearchParams()

  if (options?.projectId) {
    params.set('project_id', String(options.projectId))
  }

  if (options?.startDate) {
    params.set('start_date', options.startDate)
  }

  if (options?.endDate) {
    params.set('end_date', options.endDate)
  }

  const query = params.toString()
  const url =
    `${API_BASE_URL}/api/attendance${query ? `?${query}` : ''}`
  const response = await apiFetch(url)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not fetch attendance'),
    )
  }

  return response.json() as Promise<Attendance[]>
}

export async function createAttendance(
  record: AttendanceCreate,
): Promise<Attendance> {
  const response = await apiFetch(`${API_BASE_URL}/api/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not record attendance'),
    )
  }

  return response.json() as Promise<Attendance>
}

export async function updateAttendance(
  attendanceId: number,
  record: AttendanceCreate,
): Promise<Attendance> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/attendance/${attendanceId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Could not update attendance record',
      ),
    )
  }

  return response.json() as Promise<Attendance>
}

export async function getWorkforceSummary(options?: {
  projectId?: number
  startDate?: string
  endDate?: string
}): Promise<WorkforceSummary> {
  const params = new URLSearchParams()

  if (options?.projectId) {
    params.set('project_id', String(options.projectId))
  }

  if (options?.startDate) {
    params.set('start_date', options.startDate)
  }

  if (options?.endDate) {
    params.set('end_date', options.endDate)
  }

  const query = params.toString()
  const url =
    `${API_BASE_URL}/api/workforce/summary${query ? `?${query}` : ''}`
  const response = await apiFetch(url)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Could not fetch workforce summary',
      ),
    )
  }

  return response.json() as Promise<WorkforceSummary>
}

// -------------------- MATERIALS & INVENTORY --------------------

export type Material = {
  id: number
  project_id: number
  project_name: string
  name: string
  unit: string
  opening_stock: number
  minimum_stock: number
  unit_price: number
  supplier: string | null
  current_stock: number
  stock_value: number
  low_stock: number | boolean
}

export type MaterialCreate = {
  project_id: number
  name: string
  unit: string
  opening_stock: number
  minimum_stock: number
  unit_price: number
  supplier: string | null
}

export type MaterialTransactionType = 'Received' | 'Used'

export type MaterialTransaction = {
  id: number
  material_id: number
  material_name: string
  unit: string
  project_id: number
  project_name?: string
  transaction_type: MaterialTransactionType
  quantity: number
  transaction_date: string
  notes: string | null
  transaction_value: number
}

export type MaterialTransactionCreate = {
  material_id: number
  transaction_type: MaterialTransactionType
  quantity: number
  transaction_date: string
  notes: string | null
}

export async function getMaterials(
  projectId?: number,
): Promise<Material[]> {
  const params = new URLSearchParams()

  if (projectId) {
    params.set('project_id', String(projectId))
  }

  const query = params.toString()
  const url =
    `${API_BASE_URL}/api/materials${query ? `?${query}` : ''}`
  const response = await apiFetch(url)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not fetch materials'),
    )
  }

  return response.json() as Promise<Material[]>
}

export async function createMaterial(
  material: MaterialCreate,
): Promise<Material> {
  const response = await apiFetch(`${API_BASE_URL}/api/materials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(material),
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not register material'),
    )
  }

  return response.json() as Promise<Material>
}

export async function getMaterialTransactions(options?: {
  projectId?: number
  materialId?: number
  startDate?: string
  endDate?: string
}): Promise<MaterialTransaction[]> {
  const params = new URLSearchParams()

  if (options?.projectId) {
    params.set('project_id', String(options.projectId))
  }

  if (options?.materialId) {
    params.set('material_id', String(options.materialId))
  }

  if (options?.startDate) {
    params.set('start_date', options.startDate)
  }

  if (options?.endDate) {
    params.set('end_date', options.endDate)
  }

  const query = params.toString()
  const url =
    `${API_BASE_URL}/api/material-transactions${query ? `?${query}` : ''}`
  const response = await apiFetch(url)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Could not fetch material transactions',
      ),
    )
  }

  return response.json() as Promise<MaterialTransaction[]>
}

export async function createMaterialTransaction(
  transaction: MaterialTransactionCreate,
): Promise<MaterialTransaction> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/material-transactions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(transaction),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Could not record material transaction',
      ),
    )
  }

  return response.json() as Promise<MaterialTransaction>
}

// -------------------- TIMELINE & MILESTONES --------------------

export type MilestoneStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'On Hold'

export type Milestone = {
  id: number
  project_id: number
  project_name?: string
  title: string
  description: string | null
  planned_start_date: string
  due_date: string
  status: MilestoneStatus
  is_overdue?: number | boolean
}

export type MilestoneCreate = {
  project_id: number
  title: string
  description: string | null
  planned_start_date: string
  due_date: string
  status: MilestoneStatus
}

export type MilestoneUpdate = MilestoneCreate

export async function getMilestones(
  projectId?: number,
): Promise<Milestone[]> {
  const params = new URLSearchParams()

  if (projectId) {
    params.set('project_id', String(projectId))
  }

  const query = params.toString()
  const url =
    `${API_BASE_URL}/api/milestones${query ? `?${query}` : ''}`
  const response = await apiFetch(url)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not fetch milestones'),
    )
  }

  return response.json() as Promise<Milestone[]>
}

export async function createMilestone(
  milestone: MilestoneCreate,
): Promise<Milestone> {
  const response = await apiFetch(`${API_BASE_URL}/api/milestones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(milestone),
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not create milestone'),
    )
  }

  return response.json() as Promise<Milestone>
}

export async function updateMilestone(
  milestoneId: number,
  milestone: MilestoneUpdate,
): Promise<Milestone> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/milestones/${milestoneId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(milestone),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not update milestone'),
    )
  }

  return response.json() as Promise<Milestone>
}

// -------------------- AI SITE-REPORT ANALYZER --------------------

export type SiteReportCreate = {
  project_id: number
  report_date: string
  site_progress: number | null
  work_completed: string
  delays: string
  safety_observations: string
  materials_used: string
  general_notes: string
}

export type SiteReportSeverity = 'Low' | 'Medium' | 'High'

export type SiteReportIssue = {
  severity: SiteReportSeverity
  title: string
  details: string
  recommended_action: string
}

export type SiteReportAnalysis = {
  summary: string
  issues: SiteReportIssue[]
  follow_up_actions: string[]
}

export type SiteReport = SiteReportCreate & {
  id: number
  project_name?: string
  analysis: SiteReportAnalysis
  created_at: string
}

/**
 * Submit a daily construction site report.
 * The backend saves the report and returns its rule-based analysis.
 */
export async function createSiteReport(
  report: SiteReportCreate,
): Promise<SiteReport> {
  const response = await apiFetch(`${API_BASE_URL}/api/site-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Could not submit or analyze the site report',
      ),
    )
  }

  return response.json() as Promise<SiteReport>
}

/**
 * Retrieve site-report history, optionally filtered by project and dates.
 */
export async function getSiteReports(options?: {
  projectId?: number
  startDate?: string
  endDate?: string
}): Promise<SiteReport[]> {
  const params = new URLSearchParams()

  if (options?.projectId) {
    params.set('project_id', String(options.projectId))
  }

  if (options?.startDate) {
    params.set('start_date', options.startDate)
  }

  if (options?.endDate) {
    params.set('end_date', options.endDate)
  }

  const query = params.toString()
  const url =
    `${API_BASE_URL}/api/site-reports${query ? `?${query}` : ''}`
  const response = await apiFetch(url)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        'Could not fetch site-report history',
      ),
    )
  }

  return response.json() as Promise<SiteReport[]>
}

/**
 * Retrieve one saved report, including its analysis.
 */
export async function getSiteReport(
  reportId: number,
): Promise<SiteReport> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/site-reports/${reportId}`,
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not fetch site report'),
    )
  }

  return response.json() as Promise<SiteReport>
}

// -------------------- ACTION & ISSUE TRACKER --------------------

export type IssueCategory =
  | 'Schedule'
  | 'Safety'
  | 'Materials'
  | 'Quality'
  | 'Budget'
  | 'Workforce'
  | 'Other'

export type IssuePriority =
  | 'Low'
  | 'Medium'
  | 'High'
  | 'Critical'

export type IssueStatus =
  | 'Open'
  | 'In Progress'
  | 'Resolved'

export type IssueCreate = {
  project_id: number
  title: string
  description: string
  category: IssueCategory
  priority: IssuePriority
  assigned_to: string | null
  due_date: string | null
  status: IssueStatus
}

export type Issue = IssueCreate & {
  id: number
  project_name: string
  created_at: string
  updated_at: string
}

/**
 * Retrieve issues, optionally filtered by project, status, or priority.
 */
export async function getIssues(options?: {
  projectId?: number
  status?: IssueStatus
  priority?: IssuePriority
}): Promise<Issue[]> {
  const params = new URLSearchParams()

  if (options?.projectId) {
    params.set('project_id', String(options.projectId))
  }

  if (options?.status) {
    params.set('status', options.status)
  }

  if (options?.priority) {
    params.set('priority', options.priority)
  }

  const query = params.toString()
  const url =
    `${API_BASE_URL}/api/issues${query ? `?${query}` : ''}`
  const response = await apiFetch(url)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not fetch issues'),
    )
  }

  return response.json() as Promise<Issue[]>
}

/**
 * Create a new issue or action item.
 */
export async function createIssue(
  issue: IssueCreate,
): Promise<Issue> {
  const response = await apiFetch(`${API_BASE_URL}/api/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(issue),
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not create issue'),
    )
  }

  return response.json() as Promise<Issue>
}

/**
 * Update an existing issue.
 */
export async function updateIssue(
  issueId: number,
  issue: IssueCreate,
): Promise<Issue> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/issues/${issueId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(issue),
    },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not update issue'),
    )
  }

  return response.json() as Promise<Issue>
}

/**
 * Mark an issue as resolved.
 */
export async function resolveIssue(
  issueId: number,
): Promise<Issue> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/issues/${issueId}/resolve`,
    { method: 'PATCH' },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not resolve issue'),
    )
  }

  return response.json() as Promise<Issue>
}

/**
 * Delete an issue.
 */
export async function deleteIssue(issueId: number): Promise<void> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/issues/${issueId}`,
    { method: 'DELETE' },
  )

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, 'Could not delete issue'),
    )
  }
}