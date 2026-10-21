
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createIssue,
  deleteIssue,
  getIssues,
  resolveIssue,
  updateIssue,
  type Issue,
  type IssueCategory,
  type IssueCreate,
  type IssuePriority,
  type IssueStatus,
  type Project,
} from './api'
import './IssuesPage.css'

type IssuesPageProps = {
  projects: Project[]
  selectedProjectId: number | null
}

const categories: IssueCategory[] = [
  'Schedule',
  'Safety',
  'Materials',
  'Quality',
  'Budget',
  'Workforce',
  'Other',
]

const priorities: IssuePriority[] = ['Low', 'Medium', 'High', 'Critical']
const statuses: IssueStatus[] = ['Open', 'In Progress', 'Resolved']

const emptyForm: IssueCreate = {
  project_id: 0,
  title: '',
  description: '',
  category: 'Other',
  priority: 'Medium',
  assigned_to: '',
  due_date: '',
  status: 'Open',
}

function formatDate(value: string | null) {
  if (!value) return 'No due date'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function IssuesPage({ projects, selectedProjectId }: IssuesPageProps) {
  const [projectId, setProjectId] = useState(
    selectedProjectId ? String(selectedProjectId) : '',
  )
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<IssueCreate>(emptyForm)

  useEffect(() => {
    if (selectedProjectId) {
      setProjectId(String(selectedProjectId))
    } else if (!projectId && projects.length > 0) {
      setProjectId(String(projects[0].id))
    }
  }, [selectedProjectId, projects, projectId])

  const loadIssues = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await getIssues({
        projectId: projectId ? Number(projectId) : undefined,
        status: statusFilter ? (statusFilter as IssueStatus) : undefined,
        priority: priorityFilter
          ? (priorityFilter as IssuePriority)
          : undefined,
      })
      setIssues(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load issues.')
    } finally {
      setLoading(false)
    }
  }, [projectId, statusFilter, priorityFilter])

  useEffect(() => {
    void loadIssues()
  }, [loadIssues])

  function openNewForm() {
    setEditingId(null)
    setForm({
      ...emptyForm,
      project_id: projectId ? Number(projectId) : (projects[0]?.id ?? 0),
    })
    setShowForm(true)
    setError('')
    setNotice('')
  }

  function openEditForm(issue: Issue) {
    setEditingId(issue.id)
    setForm({
      project_id: issue.project_id,
      title: issue.title,
      description: issue.description,
      category: issue.category,
      priority: issue.priority,
      assigned_to: issue.assigned_to ?? '',
      due_date: issue.due_date ?? '',
      status: issue.status,
    })
    setShowForm(true)
    setError('')
    setNotice('')
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  function updateField<K extends keyof IssueCreate>(
    field: K,
    value: IssueCreate[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    const payload: IssueCreate = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      assigned_to: form.assigned_to?.trim() || null,
      due_date: form.due_date || null,
    }

    try {
      if (editingId !== null) {
        await updateIssue(editingId, payload)
        setNotice('Issue updated successfully.')
      } else {
        await createIssue(payload)
        setNotice('Issue created successfully.')
      }

      closeForm()
      await loadIssues()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save issue.')
    } finally {
      setSaving(false)
    }
  }

  async function handleResolve(issue: Issue) {
    setError('')
    setNotice('')

    try {
      await resolveIssue(issue.id)
      setNotice(`"${issue.title}" marked as resolved.`)
      await loadIssues()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve issue.')
    }
  }

  async function handleDelete(issue: Issue) {
    const confirmed = window.confirm(
      `Delete "${issue.title}"? This cannot be undone.`,
    )
    if (!confirmed) return

    setError('')
    setNotice('')

    try {
      await deleteIssue(issue.id)
      setNotice('Issue deleted.')
      await loadIssues()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete issue.')
    }
  }

  const openCount = issues.filter((item) => item.status === 'Open').length
  const criticalCount = issues.filter(
    (item) => item.priority === 'Critical' && item.status !== 'Resolved',
  ).length
  const resolvedCount = issues.filter(
    (item) => item.status === 'Resolved',
  ).length

  return (
    <div className="issues-page">
      <div className="issues-heading">
        <div>
          <p className="issues-eyebrow">SITE OPERATIONS / FOLLOW-UP</p>
          <h2>Action &amp; Issue Tracker</h2>
          <p>Assign responsibility, track site risks and close issues.</p>
        </div>
        <button className="issues-primary-button" onClick={openNewForm}>
          + New issue
        </button>
      </div>

      <section className="issues-metrics">
        <article className="issues-metric">
          <span>Total issues</span>
          <strong>{issues.length}</strong>
          <small>Matching current filters</small>
        </article>
        <article className="issues-metric">
          <span>Open issues</span>
          <strong>{openCount}</strong>
          <small>Awaiting action</small>
        </article>
        <article className="issues-metric issues-metric-critical">
          <span>Critical issues</span>
          <strong>{criticalCount}</strong>
          <small>Unresolved priority risks</small>
        </article>
        <article className="issues-metric">
          <span>Resolved</span>
          <strong>{resolvedCount}</strong>
          <small>Successfully closed</small>
        </article>
      </section>

      <section className="issues-panel">
        <div className="issues-section-heading">
          <div>
            <h3>Issue register</h3>
            <p>Filter the register or select an issue to edit it.</p>
          </div>
          <button
            className="issues-secondary-button"
            onClick={() => void loadIssues()}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="issues-filters">
          <label>
            Project
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
            >
              <option value="">All priorities</option>
              {priorities.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </label>
        </div>

        {error && <div className="issues-message issues-error">{error}</div>}
        {notice && <div className="issues-message issues-success">{notice}</div>}

        {loading ? (
          <div className="issues-empty">Loading issues…</div>
        ) : issues.length === 0 ? (
          <div className="issues-empty">
            <strong>No issues found</strong>
            <p>Create an issue or adjust your filters to see records here.</p>
          </div>
        ) : (
          <div className="issues-list">
            {issues.map((issue) => (
              <article className="issue-card" key={issue.id}>
                <div className="issue-card-top">
                  <div className="issue-tags">
                    <span className={`issue-priority priority-${issue.priority.toLowerCase()}`}>
                      {issue.priority}
                    </span>
                    <span className="issue-category">{issue.category}</span>
                    <span className={`issue-status status-${issue.status.toLowerCase().replace(' ', '-')}`}>
                      {issue.status}
                    </span>
                  </div>
                  <span className="issue-id">ISSUE-{String(issue.id).padStart(3, '0')}</span>
                </div>

                <h4>{issue.title}</h4>
                {issue.description && <p className="issue-description">{issue.description}</p>}

                <div className="issue-meta">
                  <span><strong>Project:</strong> {issue.project_name}</span>
                  <span><strong>Assigned:</strong> {issue.assigned_to || 'Unassigned'}</span>
                  <span><strong>Due:</strong> {formatDate(issue.due_date)}</span>
                </div>

                <div className="issue-actions">
                  <button
                    className="issues-secondary-button"
                    onClick={() => openEditForm(issue)}
                  >
                    Edit
                  </button>
                  {issue.status !== 'Resolved' && (
                    <button
                      className="issues-resolve-button"
                      onClick={() => void handleResolve(issue)}
                    >
                      Mark resolved
                    </button>
                  )}
                  <button
                    className="issues-delete-button"
                    onClick={() => void handleDelete(issue)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <div className="issues-modal-backdrop">
          <section className="issues-modal" role="dialog" aria-modal="true" aria-labelledby="issue-form-title">
            <div className="issues-section-heading">
              <div>
                <h3 id="issue-form-title">{editingId !== null ? 'Edit issue' : 'Create an issue'}</h3>
                <p>Record the issue and assign the next action.</p>
              </div>
              <button className="issues-close-button" onClick={closeForm} aria-label="Close form">
                ×
              </button>
            </div>

            <form className="issues-form" onSubmit={handleSubmit}>
              <label>
                Project *
                <select
                  value={form.project_id || ''}
                  onChange={(event) => updateField('project_id', Number(event.target.value))}
                  required
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>

              <label className="issues-full-width">
                Issue title *
                <input
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                  maxLength={200}
                  required
                  placeholder="e.g. Concrete delivery delayed"
                />
              </label>

              <label className="issues-full-width">
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => updateField('description', event.target.value)}
                  maxLength={3000}
                  rows={3}
                  placeholder="Describe the issue and required follow-up…"
                />
              </label>

              <label>
                Category
                <select
                  value={form.category}
                  onChange={(event) => updateField('category', event.target.value as IssueCategory)}
                >
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>

              <label>
                Priority
                <select
                  value={form.priority}
                  onChange={(event) => updateField('priority', event.target.value as IssuePriority)}
                >
                  {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                </select>
              </label>

              <label>
                Assigned to
                <input
                  value={form.assigned_to ?? ''}
                  onChange={(event) => updateField('assigned_to', event.target.value)}
                  maxLength={150}
                  placeholder="Site engineer"
                />
              </label>

              <label>
                Due date
                <input
                  type="date"
                  value={form.due_date ?? ''}
                  onChange={(event) => updateField('due_date', event.target.value)}
                />
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) => updateField('status', event.target.value as IssueStatus)}
                >
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>

              {error && <div className="issues-message issues-error issues-full-width">{error}</div>}

              <div className="issues-form-actions issues-full-width">
                <button type="button" className="issues-secondary-button" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="issues-primary-button" disabled={saving}>
                  {saving ? 'Saving…' : editingId !== null ? 'Save changes' : 'Create issue'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default IssuesPage
