
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  createProject,
  getHealth,
  getProjects,
  getWorkforceSummary,
  getMaterials,
  getMilestones,
  updateProject,
  type HealthStatus,
  type Project,
  type ProjectCreate,
  type WorkforceSummary,
  type Material,
  type Milestone,
} from './api'
import ProjectsPage from './ProjectsPage'
import WorkforcePage from './WorkforcePage'
import MaterialsPage from './MaterialsPage'
import TimelinePage from './TimelinePage'
import SiteReportsPage from './SiteReportsPage'
import AIInsightsPage from './AIInsightsPage'
import IssuesPage from './IssuesPage'
import ProjectMapPage from './ProjectMapPage'
import './App.css'

const navigation = [
  { label: 'Overview', icon: '◫' },
  { label: 'Projects', icon: '▤' },
  { label: 'Workforce', icon: '♙' },
  { label: 'Materials', icon: '▦' },
  { label: 'Timeline', icon: '◷' },
  { label: 'AI Insights', icon: '✳' },
  { label: 'Site Reports', icon: '▧' },
  { label: 'Project Map', icon: '⌖' },
] as const

type PageName = (typeof navigation)[number]['label'] | 'Issues'

type DashboardData = {
  workforce: WorkforceSummary[]
  materials: Material[]
  milestones: Milestone[]
  failedRequests: number
}

const emptyDashboardData: DashboardData = {
  workforce: [],
  materials: [],
  milestones: [],
  failedRequests: 0,
}

function getInitialPage(): PageName {
  const page = new URLSearchParams(window.location.search).get('page')

  if (page === 'Issues') {
    return 'Issues'
  }

  return navigation.find((item) => item.label === page)?.label ?? 'Overview'
}

const emptyForm: ProjectCreate = {
  name: '',
  location: '',
  project_type: 'Building construction',
  progress: 0,
  budget: 0,
  actual_expenditure: 0,
}

function todayString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatCurrency(amount: number): string {
  return `₹${(amount / 100000).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}L`
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 1,
  }).format(value)
}


function downloadProjectsCSV(projects: Project[]) {
  const headers = [
    'Project ID',
    'Project Name',
    'Location',
    'Project Type',
    'Progress (%)',
    'Budget (INR)',
    'Actual Expenditure (INR)',
    'Remaining Budget (INR)',
  ]

  const escapeCSV = (value: string | number) => {
    const text = String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  const rows = projects.map((project) => [
    project.id,
    project.name,
    project.location,
    project.project_type,
    project.progress,
    project.budget,
    project.actual_expenditure,
    project.budget - project.actual_expenditure,
  ])

  const csvContent = [
    headers,
    ...rows,
  ]
    .map((row) => row.map(escapeCSV).join(','))
    .join('\r\n')

  const blob = new Blob(
    ['\uFEFF', csvContent],
    { type: 'text/csv;charset=utf-8;' },
  )

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = 'sitepilot-project-report.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}


function App() {
  const [activePage, setActivePage] = useState<PageName>(getInitialPage)
  const [backendStatus, setBackendStatus] = useState('Checking...')
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [projectError, setProjectError] = useState('')
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null)
  const [formData, setFormData] = useState<ProjectCreate>(emptyForm)
  const [savingProject, setSavingProject] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [formError, setFormError] = useState(false)
  const [dashboardData, setDashboardData] =
    useState<DashboardData>(emptyDashboardData)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const projectFormRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('page', activePage)
    window.history.replaceState({}, '', url)
  }, [activePage])

  useEffect(() => {
    function handlePopState() {
      setActivePage(getInitialPage())
      setFormMessage('')
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function navigateToPage(page: PageName) {
    setActivePage(page)
    setFormMessage('')

    const url = new URL(window.location.href)
    url.searchParams.set('page', page)
    window.history.pushState({}, '', url)
  }

  useEffect(() => {
    getHealth()
      .then((data) => {
        setHealth(data)
        setBackendStatus('Connected')
      })
      .catch(() => {
        setHealth(null)
        setBackendStatus('Unavailable')
      })

    getProjects()
      .then((data) => {
        setProjects(data)

        const savedProjectId = localStorage.getItem(
          'sitepilot-selected-project',
        )
        const savedId = savedProjectId ? Number(savedProjectId) : null
        const projectStillExists = data.some((item) => item.id === savedId)
        const initialId = projectStillExists ? savedId : (data[0]?.id ?? null)

        setSelectedProjectId(initialId)

        if (initialId !== null) {
          localStorage.setItem('sitepilot-selected-project', String(initialId))
        }

        setProjectError('')
      })
      .catch((error) => {
        console.error('Project fetch failed:', error)
        setProjectError(
          'Could not load projects. Check the backend connection.',
        )
      })
      .finally(() => setLoadingProjects(false))
  }, [])

  // Load real workforce, material and milestone records for the portfolio.
  useEffect(() => {
    let cancelled = false

    async function loadDashboardData() {
      if (projects.length === 0) {
        setDashboardData(emptyDashboardData)
        setLoadingDashboard(false)
        setDashboardError('')
        return
      }

      setLoadingDashboard(true)
      setDashboardError('')

      const workforce: WorkforceSummary[] = []
      const materials: Material[] = []
      const milestones: Milestone[] = []
      let failedRequests = 0

      try {
        const projectResults = await Promise.all(
          projects.map(async (item) => {
            const results = await Promise.allSettled([
              getWorkforceSummary({ projectId: item.id }),
              getMaterials(item.id),
              getMilestones(item.id),
            ] as const)

            return { projectId: item.id, results }
          }),
        )

        for (const result of projectResults) {
          const [workforceResult, materialsResult, milestonesResult] =
            result.results

          if (workforceResult.status === 'fulfilled') {
            workforce.push(workforceResult.value)
          } else {
            failedRequests += 1
          }

          if (materialsResult.status === 'fulfilled') {
            materials.push(...materialsResult.value)
          } else {
            failedRequests += 1
          }

          if (milestonesResult.status === 'fulfilled') {
            milestones.push(...milestonesResult.value)
          } else {
            failedRequests += 1
          }
        }

        if (!cancelled) {
          setDashboardData({
            workforce,
            materials,
            milestones,
            failedRequests,
          })

          if (failedRequests > 0) {
            setDashboardError(
              'Some operational records could not be loaded. Metrics may be incomplete.',
            )
          }
        }
      } catch (error) {
        console.error('Dashboard data fetch failed:', error)
        if (!cancelled) {
          setDashboardError(
            'Could not load all operational metrics. Check the backend connection.',
          )
        }
      } finally {
        if (!cancelled) setLoadingDashboard(false)
      }
    }

    void loadDashboardData()

    return () => {
      cancelled = true
    }
  }, [projects])

  const project =
    projects.find((item) => item.id === selectedProjectId) ?? null


  const totalBudget = projects.reduce((sum, item) => sum + item.budget, 0)
  const totalExpenditure = projects.reduce(
    (sum, item) => sum + item.actual_expenditure,
    0,
  )
  const averageProgress =
    projects.length > 0
      ? projects.reduce((sum, item) => sum + item.progress, 0) /
        projects.length
      : 0

  const registeredWorkers = dashboardData.workforce.reduce(
    (sum, item) => sum + item.worker_count,
    0,
  )

  const lowStockMaterials = dashboardData.materials.filter(
    (item) => Boolean(item.low_stock),
  )

  const overdueMilestones = dashboardData.milestones.filter(
    (item) =>
      item.status !== 'Completed' && item.due_date < todayString(),
  )

  const overBudgetProjects = projects.filter(
    (item) => item.budget > 0 && item.actual_expenditure > item.budget,
  )

  const selectedMilestones = dashboardData.milestones.filter(
    (item) => item.project_id === selectedProjectId,
  )

  const selectedLowStockCount = lowStockMaterials.filter(
    (item) => item.project_id === selectedProjectId,
  ).length

  const selectedOverdueCount = overdueMilestones.filter(
    (item) => item.project_id === selectedProjectId,
  ).length

  function selectProject(projectId: number) {
    setSelectedProjectId(projectId)
    localStorage.setItem('sitepilot-selected-project', String(projectId))
  }

  function updateForm<K extends keyof ProjectCreate>(
    field: K,
    value: ProjectCreate[K],
  ) {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  function scrollToProjectForm() {
    requestAnimationFrame(() => {
      projectFormRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  function openCreateForm() {
    setEditingProjectId(null)
    setFormData(emptyForm)
    setFormMessage('')
    setFormError(false)
    setShowProjectForm(true)
    scrollToProjectForm()
  }

  function openEditForm(projectId?: number) {
    const targetProject =
      projects.find((item) => item.id === projectId) ?? project

    if (!targetProject) return

    selectProject(targetProject.id)
    setEditingProjectId(targetProject.id)
    setFormData({
      name: targetProject.name,
      location: targetProject.location,
      project_type: targetProject.project_type,
      progress: targetProject.progress,
      budget: targetProject.budget,
      actual_expenditure: targetProject.actual_expenditure,
    })
    setFormMessage('')
    setFormError(false)
    setShowProjectForm(true)
    scrollToProjectForm()
  }

  function closeForm() {
    setShowProjectForm(false)
    setEditingProjectId(null)
    setFormData(emptyForm)
  }

  async function handleSaveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSavingProject(true)
    setFormMessage('')
    setFormError(false)

    const payload: ProjectCreate = {
      ...formData,
      name: formData.name.trim(),
      location: formData.location.trim(),
      project_type: formData.project_type.trim(),
    }

    try {
      if (editingProjectId !== null) {
        const savedProject = await updateProject(editingProjectId, payload)

        setProjects((current) =>
          current.map((item) =>
            item.id === savedProject.id ? savedProject : item,
          ),
        )

        selectProject(savedProject.id)
        setFormMessage(`Project "${savedProject.name}" updated successfully.`)
      } else {
        const savedProject = await createProject(payload)

        setProjects((current) => [...current, savedProject])
        selectProject(savedProject.id)
        setFormMessage(`Project "${savedProject.name}" created successfully.`)
      }

      setShowProjectForm(false)
      setEditingProjectId(null)
      setFormData(emptyForm)
    } catch (error) {
      setFormError(true)
      setFormMessage(
        error instanceof Error ? error.message : 'Could not save project.',
      )
    } finally {
      setSavingProject(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div>
            <h1>
              SitePilot<span>AI</span>
            </h1>
            <p>PROJECT INTELLIGENCE</p>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map((item) => (
            <button
              key={item.label}
              className={
                activePage === item.label ? 'nav-item active' : 'nav-item'
              }
              onClick={() => navigateToPage(item.label)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.label === 'AI Insights' && (
                <span className="ai-tag">AI</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="status-dot" />
          <div>
            <strong>Backend: {backendStatus}</strong>
            <p>
              {health
                ? `${health.service} v${health.version}`
                : backendStatus === 'Unavailable'
                  ? 'Could not reach the API'
                  : 'Checking API connection'}
            </p>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {activePage}
          </div>
          <div className="topbar-right">
            <span className="environment-badge">DEMO DATA</span>
            <div className="avatar">DK</div>
          </div>
        </header>

        <section className="page-content">
          <div className="welcome-row">
            <div>
              <p className="eyebrow">CONSTRUCTION OPERATIONS</p>
              <h2>
                {activePage === 'Overview' ? 'Executive overview' : activePage}
              </h2>
              <p className="page-description">
                Monitor portfolio performance, site resources, and project risks in one place.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="primary-button" onClick={openCreateForm}>
              + New Project
            </button>

            <button
              className="text-button"
              onClick={() => openEditForm()}
              disabled={!project}
            >
              Edit Project
            </button>
            <button
              className="text-button"
              onClick={() => {
                window.open(
                  `${window.location.origin}/?page=Issues`,
                  '_blank',
                  'noopener,noreferrer',
                )
              }}
            >
              Action &amp; Issues ↗
            </button>
            <button
              className="text-button"
              onClick={() => downloadProjectsCSV(projects)}
              disabled={projects.length === 0}
            >
              Download CSV ↓
            </button>

            <button
              className="text-button"
              onClick={() => {
                window.open(
                  'http://127.0.0.1:8000/api/projects/report/pdf',
                  '_blank',
                )
              }}
            >
              Download PDF ↓
            </button>


          </div>


          {formMessage && (
            <div
              className="panel"
              role="status"
              style={{
                marginBottom: '20px',
                borderLeft: `4px solid ${formError ? '#dc6262' : '#27a879'}`,
              }}
            >
              {formMessage}
            </div>
          )}

          {showProjectForm && (
            <section ref={projectFormRef} className="panel project-form-panel">
              <div className="panel-heading">
                <div>
                  <h3>
                    {editingProjectId !== null
                      ? 'Edit construction project'
                      : 'Create a construction project'}
                  </h3>
                  <p>
                    {editingProjectId !== null
                      ? "Update the project's current details."
                      : "Enter the project's initial details and budget."}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveProject}>
                <div className="project-form-grid">
                  <label>
                    Project name
                    <input
                      required
                      minLength={1}
                      value={formData.name}
                      onChange={(event) => updateForm('name', event.target.value)}
                      placeholder="e.g. City Road Upgrade"
                    />
                  </label>

                  <label>
                    Location
                    <input
                      required
                      minLength={1}
                      value={formData.location}
                      onChange={(event) => updateForm('location', event.target.value)}
                      placeholder="e.g. Kozhikode, Kerala"
                    />
                  </label>

                  <label>
                    Project type
                    <select
                      required
                      value={formData.project_type}
                      onChange={(event) => updateForm('project_type', event.target.value)}
                    >
                      <option>Building construction</option>
                      <option>Road construction</option>
                      <option>Bridge construction</option>
                      <option>Infrastructure development</option>
                      <option>Other</option>
                    </select>
                  </label>

                  <label>
                    Progress (%)
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      step="0.1"
                      value={formData.progress}
                      onChange={(event) => updateForm('progress', Number(event.target.value))}
                    />
                  </label>

                  <label>
                    Approved budget (₹)
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.budget}
                      onChange={(event) => updateForm('budget', Number(event.target.value))}
                    />
                  </label>

                  <label>
                    Actual expenditure (₹)
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.actual_expenditure}
                      onChange={(event) => updateForm('actual_expenditure', Number(event.target.value))}
                    />
                  </label>
                </div>

                <div className="project-form-actions">
                  <button className="primary-button" type="submit" disabled={savingProject}>
                    {savingProject
                      ? 'Saving...'
                      : editingProjectId !== null
                        ? 'Save Changes'
                        : 'Save Project'}
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={savingProject}
                    onClick={closeForm}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          )}

          {projectError && (
            <div className="panel">
              <p>{projectError}</p>
            </div>
          )}

          {activePage === 'Projects' ? (
            <ProjectsPage
              projects={projects}
              onSelectProject={(projectId) => {
                selectProject(projectId)
                navigateToPage('Overview')
              }}
              onCreateProject={openCreateForm}
              onEditProject={openEditForm}
            />
          ) : activePage === 'Workforce' ? (
            <WorkforcePage projects={projects} selectedProjectId={selectedProjectId} />
          ) : activePage === 'Materials' ? (
            <MaterialsPage projects={projects} selectedProjectId={selectedProjectId} />
          ) : activePage === 'Timeline' ? (
            <TimelinePage
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={selectProject}
            />
          ) : activePage === 'Site Reports' ? (
            <SiteReportsPage projects={projects} selectedProjectId={selectedProjectId} />
          ) : activePage === 'Project Map' ? (
            <ProjectMapPage projects={projects} />
          ) : activePage === 'AI Insights' ? (
            <AIInsightsPage
              projects={projects}
              selectedProjectId={selectedProjectId}
              onSelectProject={selectProject}
            />
          ) : activePage === 'Issues' ? (
            <IssuesPage
              projects={projects}
              selectedProjectId={selectedProjectId}
            />
          ) : (
            <>
              <div className="project-banner">
                <div className="project-symbol">SP</div>
                <div className="project-details">
                  <p className="eyebrow">SELECTED PROJECT</p>
                  <h3>
                    {loadingProjects
                      ? 'Loading project...'
                      : project?.name ?? 'No projects available'}
                  </h3>
                  <p>
                    {project
                      ? `${project.project_type} · ${project.location}`
                      : loadingProjects
                        ? 'Fetching project details...'
                        : 'Create a project to get started.'}
                  </p>
                </div>

                <div className="project-progress">
                  <div className="progress-heading">
                    <span>Reported progress</span>
                    <strong>{project ? `${formatNumber(project.progress)}%` : '—'}</strong>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min(100, Math.max(0, project?.progress ?? 0))}%` }}
                    />
                  </div>
                  <p>Based on saved project details</p>
                </div>
              </div>

              <div className="section-heading">
                <div>
                  <h3>Portfolio performance</h3>
                  <p>Summary calculated from saved project records</p>
                </div>

                <label>
                  <span className="period-label">SELECT PROJECT </span>
                  <select
                    aria-label="Select project"
                    value={selectedProjectId ?? ''}
                    onChange={(event) => {
                      const selectedId = event.target.value ? Number(event.target.value) : null
                      if (selectedId !== null) selectProject(selectedId)
                    }}
                    disabled={projects.length === 0}
                  >
                    {projects.length === 0 && <option value="">No projects</option>}
                    {projects.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="metrics-grid">
                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Total projects</span>
                    <span className="metric-icon budget-icon">▤</span>
                  </div>
                  <h3>{loadingProjects ? '—' : projects.length}</h3>
                  <p className="metric-note">Projects saved in the workspace</p>
                  <div className="mini-track">
                    <div className="mini-fill budget-fill" style={{ width: projects.length ? '100%' : '0%' }} />
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Approved budgets</span>
                    <span className="metric-icon budget-icon">₹</span>
                  </div>
                  <h3>{loadingProjects ? '—' : formatCurrency(totalBudget)}</h3>
                  <p className="metric-note">Combined approved project budgets</p>
                  <div className="mini-track">
                    <div className="mini-fill budget-fill" style={{ width: totalBudget > 0 ? '100%' : '0%' }} />
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Actual expenditure</span>
                    <span className="metric-icon cost-icon">↗</span>
                  </div>
                  <h3>{loadingProjects ? '—' : formatCurrency(totalExpenditure)}</h3>
                  <p className="metric-note">
                    {totalBudget > 0
                      ? `${((totalExpenditure / totalBudget) * 100).toFixed(1)}% of combined budgets`
                      : 'No approved budget recorded'}
                  </p>
                  <div className="mini-track">
                    <div
                      className="mini-fill cost-fill"
                      style={{ width: `${totalBudget > 0 ? Math.min(100, Math.max(0, (totalExpenditure / totalBudget) * 100)) : 0}%` }}
                    />
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Average progress</span>
                    <span className="metric-icon people-icon">%</span>
                  </div>
                  <h3>{projects.length ? `${averageProgress.toFixed(1)}%` : '—'}</h3>
                  <p className="metric-note">Average of reported project progress</p>
                  <div className="mini-track">
                    <div className="mini-fill budget-fill" style={{ width: `${Math.min(100, Math.max(0, averageProgress))}%` }} />
                  </div>
                </article>
              </div>

              {dashboardError && (
                <div className="panel" role="status" style={{ marginTop: '18px' }}>
                  <p>{dashboardError}</p>
                </div>
              )}

              <div className="section-heading">
                <div>
                  <h3>Operational snapshot</h3>
                  <p>Live counts from workforce, inventory and timeline records</p>
                </div>
              </div>

              <div className="metrics-grid">
                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Registered workforce</span>
                    <span className="metric-icon people-icon">♙</span>
                  </div>
                  <h3>{loadingDashboard ? '—' : formatNumber(registeredWorkers)}</h3>
                  <p className="metric-note">Registered workers across projects</p>
                  <div className="metric-footer">
                    {loadingDashboard ? 'Loading workforce records…' : 'Based on saved workforce data'}
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Low-stock materials</span>
                    <span className="metric-icon issue-icon">!</span>
                  </div>
                  <h3>{loadingDashboard ? '—' : lowStockMaterials.length}</h3>
                  <p className="metric-note">Materials at or below their configured threshold</p>
                  <div className="metric-footer issue-footer">
                    {loadingDashboard ? 'Checking inventory…' : 'Across all projects'}
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Overdue milestones</span>
                    <span className="metric-icon issue-icon">◷</span>
                  </div>
                  <h3>{loadingDashboard ? '—' : overdueMilestones.length}</h3>
                  <p className="metric-note">Past due date and not marked completed</p>
                  <div className="metric-footer issue-footer">
                    {loadingDashboard ? 'Checking schedules…' : 'Across all projects'}
                  </div>
                </article>

                <article className="metric-card">
                  <div className="metric-top">
                    <span className="metric-label">Over-budget projects</span>
                    <span className="metric-icon cost-icon">↗</span>
                  </div>
                  <h3>{overBudgetProjects.length}</h3>
                  <p className="metric-note">Expenditure is greater than approved budget</p>
                  <div className="metric-footer">
                    Based on saved financial figures
                  </div>
                </article>
              </div>

              <div className="lower-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Project comparison</h3>
                      <p>Reported progress and budget utilisation by project</p>
                    </div>
                    <button className="text-button" onClick={() => navigateToPage('Projects')}>
                      View projects →
                    </button>
                  </div>

                  {projects.length === 0 ? (
                    <div className="insight-placeholder">
                      <h4>No projects available</h4>
                      <p>Create a project to start tracking portfolio performance.</p>
                    </div>
                  ) : (
                    <div className="activity-list">
                      {projects.map((item) => {
                        const utilisation = item.budget > 0
                          ? (item.actual_expenditure / item.budget) * 100
                          : null

                        return (
                          <div className="activity-row" key={item.id}>
                            <div className="activity-info">
                              <span className={`activity-dot ${item.id === selectedProjectId ? 'completed' : 'in-progress'}`} />
                              <div>
                                <strong>{item.name}</strong>
                                <p>{item.location} · Progress {formatNumber(item.progress)}%</p>
                                <p>
                                  Budget used: {utilisation === null ? 'N/A' : `${utilisation.toFixed(1)}%`}
                                </p>
                              </div>
                            </div>
                            <div className="activity-value">
                              <strong>{formatNumber(item.progress)}%</strong>
                              <div className="activity-track">
                                <div style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} />
                              </div>
                              <button className="text-button" onClick={() => selectProject(item.id)}>
                                Select
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>

                <section className="panel insight-panel">
                  <div className="panel-heading">
                    <div>
                      <div className="insight-title">
                        <span>✳</span>
                        <h3>Selected-project alerts</h3>
                      </div>
                      <p>{project ? project.name : 'Select a project to review alerts'}</p>
                    </div>
                    <span className="ai-tag">REVIEW</span>
                  </div>

                  <div className="activity-list">
                    {!project ? (
                      <p className="metric-note">No project is currently selected.</p>
                    ) : (
                      <>
                        <div className="activity-row">
                          <div className="activity-info">
                            <span className={`activity-dot ${selectedOverdueCount > 0 ? 'pending' : 'completed'}`} />
                            <div>
                              <strong>Overdue milestones</strong>
                              <p>{selectedOverdueCount} incomplete milestone(s) past due</p>
                            </div>
                          </div>
                        </div>
                        <div className="activity-row">
                          <div className="activity-info">
                            <span className={`activity-dot ${selectedLowStockCount > 0 ? 'pending' : 'completed'}`} />
                            <div>
                              <strong>Low-stock materials</strong>
                              <p>{selectedLowStockCount} material item(s) flagged low</p>
                            </div>
                          </div>
                        </div>
                        <div className="activity-row">
                          <div className={`activity-info`}>
                            <span className={`activity-dot ${project.budget > 0 && project.actual_expenditure > project.budget ? 'pending' : 'completed'}`} />
                            <div>
                              <strong>Budget position</strong>
                              <p>
                                {project.budget <= 0
                                  ? 'No approved budget recorded'
                                  : project.actual_expenditure > project.budget
                                    ? 'Expenditure exceeds approved budget'
                                    : `${formatCurrency(project.budget - project.actual_expenditure)} remaining`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    className="primary-button full-button"
                    onClick={() => navigateToPage('AI Insights')}
                  >
                    Explore AI insights
                  </button>
                  <p className="disclaimer">
                    Alerts are indicators for human review, not certified engineering decisions.
                  </p>
                </section>
              </div>

              <div className="section-heading">
                <div>
                  <h3>Selected-project schedule</h3>
                  <p>Recorded milestones for the selected project</p>
                </div>
                <button className="text-button" onClick={() => navigateToPage('Timeline')}>
                  Open timeline →
                </button>
              </div>

              <section className="panel">
                {loadingDashboard ? (
                  <p>Loading schedule records…</p>
                ) : selectedMilestones.length === 0 ? (
                  <p>No milestones have been recorded for this project yet.</p>
                ) : (
                  <div className="activity-list">
                    {selectedMilestones
                      .slice()
                      .sort((a, b) => a.due_date.localeCompare(b.due_date))
                      .slice(0, 5)
                      .map((milestone) => {
                        const isOverdue =
                          milestone.status !== 'Completed' &&
                          milestone.due_date < todayString()

                        return (
                          <div className="activity-row" key={milestone.id}>
                            <div className="activity-info">
                              <span className={`activity-dot ${milestone.status === 'Completed' ? 'completed' : isOverdue ? 'pending' : 'in-progress'}`} />
                              <div>
                                <strong>{milestone.title}</strong>
                                <p>Due {milestone.due_date} · {milestone.status}</p>
                              </div>
                            </div>
                            <div className="activity-value">
                              <strong>{isOverdue ? 'Overdue' : milestone.status}</strong>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}
              </section>
            </>
          )}

          <footer className="page-footer">
            <span>SitePilot AI · Independent prototype</span>
            <span>Figures reflect the project's recorded demo data</span>
          </footer>
        </section>
      </main>
    </div>
  )
}

export default App
