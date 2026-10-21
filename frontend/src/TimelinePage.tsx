
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createMilestone,
  getMilestones,
  updateMilestone,
  type Milestone,
  type MilestoneStatus,
  type Project,
} from './api'
import './TimelinePage.css'

type TimelinePageProps = {
  projects: Project[]
  selectedProjectId: number | null
  onSelectProject: (projectId: number) => void
}

type MilestoneFormValues = {
  title: string
  description: string
  planned_start_date: string
  due_date: string
  status: MilestoneStatus
}

const STATUSES: MilestoneStatus[] = [
  'Not Started',
  'In Progress',
  'Completed',
  'On Hold',
]

function todayString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function TimelinePage({
  projects,
  selectedProjectId,
  onSelectProject,
}: TimelinePageProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [plannedStartDate, setPlannedStartDate] = useState(todayString())
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState<MilestoneStatus>('Not Started')

  const [editForm, setEditForm] = useState<MilestoneFormValues>({
    title: '',
    description: '',
    planned_start_date: '',
    due_date: '',
    status: 'Not Started',
  })

  const selectedProject = projects.find(
    (project) => project.id === selectedProjectId,
  )

  const loadMilestones = useCallback(async () => {
    if (!selectedProjectId) {
      setMilestones([])
      return
    }

    setLoading(true)
    setError('')

    try {
      const records = await getMilestones(selectedProjectId)
      setMilestones(records)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load milestones.',
      )
    } finally {
      setLoading(false)
    }
  }, [selectedProjectId])

  useEffect(() => {
    setEditingId(null)
    void loadMilestones()
  }, [loadMilestones])

  const completedCount = milestones.filter(
    (milestone) => milestone.status === 'Completed',
  ).length

  const overdueCount = milestones.filter(
    (milestone) =>
      milestone.status !== 'Completed' &&
      milestone.due_date < todayString(),
  ).length

  const completionPercentage =
    milestones.length > 0
      ? Math.round((completedCount / milestones.length) * 100)
      : 0

  const budget = selectedProject?.budget ?? 0
  const expenditure = selectedProject?.actual_expenditure ?? 0
  const budgetUsage = budget > 0 ? (expenditure / budget) * 100 : 0

  async function handleCreateMilestone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!selectedProjectId) {
      setError('Select a project before adding a milestone.')
      return
    }

    if (plannedStartDate > dueDate) {
      setError('The start date must be on or before the due date.')
      return
    }

    setSaving(true)

    try {
      await createMilestone({
        project_id: selectedProjectId,
        title: title.trim(),
        description: description.trim() || null,
        planned_start_date: plannedStartDate,
        due_date: dueDate,
        status,
      })

      setTitle('')
      setDescription('')
      setPlannedStartDate(todayString())
      setDueDate('')
      setStatus('Not Started')
      setSuccess('Milestone created successfully.')
      await loadMilestones()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not create milestone.',
      )
    } finally {
      setSaving(false)
    }
  }

  function startEditing(milestone: Milestone) {
    setEditingId(milestone.id)
    setEditForm({
      title: milestone.title,
      description: milestone.description ?? '',
      planned_start_date: milestone.planned_start_date,
      due_date: milestone.due_date,
      status: milestone.status,
    })
    setError('')
    setSuccess('')
  }

  function cancelEditing() {
    setEditingId(null)
    setError('')
  }

  async function handleUpdateMilestone(
    event: FormEvent<HTMLFormElement>,
    milestone: Milestone,
  ) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!editForm.title.trim()) {
      setError('Milestone title is required.')
      return
    }

    if (editForm.planned_start_date > editForm.due_date) {
      setError('The start date must be on or before the due date.')
      return
    }

    setSaving(true)

    try {
      await updateMilestone(milestone.id, {
        project_id: milestone.project_id,
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        planned_start_date: editForm.planned_start_date,
        due_date: editForm.due_date,
        status: editForm.status,
      })

      setEditingId(null)
      setSuccess(`"${editForm.title.trim()}" updated successfully.`)
      await loadMilestones()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not update milestone.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="timeline-page">
      <header className="timeline-header">
        <div>
          <p className="timeline-eyebrow">PROJECT PLANNING</p>
          <h1 className="timeline-page-title">Project Timeline</h1>
          <p className="timeline-subtitle">
            Track construction milestones, schedules, budgets and potential delays.
          </p>
        </div>
      </header>

      <section className="timeline-project-selector">
        <label htmlFor="timeline-project-selector">Select project</label>
        <select
          id="timeline-project-selector"
          value={selectedProjectId ?? ''}
          onChange={(event) => {
            const projectId = Number(event.target.value)
            if (projectId > 0) {
              onSelectProject(projectId)
              setSuccess('')
              setError('')
              setEditingId(null)
            }
          }}
          disabled={projects.length === 0}
        >
          {projects.length === 0 ? (
            <option value="">No projects available</option>
          ) : (
            projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} — {item.location}
              </option>
            ))
          )}
        </select>
      </section>

      {selectedProject && (
        <p className="timeline-subtitle">
          Currently viewing: <strong>{selectedProject.name}</strong>
        </p>
      )}

      {error && (
        <div className="timeline-notice error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="timeline-notice success" role="status">
          {success}
        </div>
      )}

      {!selectedProjectId && (
        <div className="timeline-notice">
          Select a project to view and manage its timeline.
        </div>
      )}

      <section className="timeline-summary-grid">
        <SummaryCard label="Total milestones" value={String(milestones.length)} />
        <SummaryCard label="Completed" value={String(completedCount)} />
        <SummaryCard
          label="Overdue milestones"
          value={String(overdueCount)}
          warning={overdueCount > 0}
        />
        <SummaryCard
          label="Completion rate"
          value={`${completionPercentage}%`}
        />
      </section>

      {selectedProject && (
        <section className="timeline-panel">
          <div className="timeline-panel-heading">
            <h2 className="timeline-panel-title">Financial overview</h2>
            <p className="timeline-panel-description">
              Recorded project budget and expenditure.
            </p>
          </div>

          <div className="timeline-financial-grid">
            <FinancialCard
              label="Approved budget"
              value={formatCurrency(budget)}
            />
            <FinancialCard
              label="Actual expenditure"
              value={formatCurrency(expenditure)}
            />
            <FinancialCard
              label="Budget remaining"
              value={formatCurrency(budget - expenditure)}
            />
          </div>

          <div className="timeline-budget-section">
            <div className="timeline-budget-heading">
              <span>Budget utilisation</span>
              <strong>
                {budget > 0 ? `${budgetUsage.toFixed(1)}%` : 'N/A'}
              </strong>
            </div>
            <div
              className="timeline-budget-track"
              role="progressbar"
              aria-label="Budget utilisation"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.max(0, budgetUsage))}
            >
              <div
                className={`timeline-budget-fill ${
                  expenditure > budget && budget > 0 ? 'over-budget' : ''
                }`}
                style={{
                  width: `${Math.min(100, Math.max(0, budgetUsage))}%`,
                }}
              />
            </div>
            {budget > 0 && expenditure > budget && (
              <p className="timeline-over-budget-message">
                Expenditure exceeds the approved budget.
              </p>
            )}
          </div>
        </section>
      )}

      <section className="timeline-panel">
        <div className="timeline-panel-heading">
          <h2 className="timeline-panel-title">Add milestone</h2>
          <p className="timeline-panel-description">
            Record a planned activity for the selected construction project.
          </p>
        </div>

        <form className="timeline-form" onSubmit={handleCreateMilestone}>
          <label>
            Milestone title *
            <input
              required
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Foundation Work"
            />
          </label>

          <label>
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as MilestoneStatus)
              }
            >
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            Planned start date *
            <input
              type="date"
              required
              value={plannedStartDate}
              onChange={(event) => setPlannedStartDate(event.target.value)}
            />
          </label>

          <label>
            Due date *
            <input
              type="date"
              required
              min={plannedStartDate}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>

          <label className="full-width">
            Description
            <textarea
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe the work, dependencies or inspection requirements."
            />
          </label>

          <div className="timeline-form-actions">
            <button
              className="timeline-primary-button"
              type="submit"
              disabled={saving || !selectedProjectId}
            >
              {saving ? 'Saving milestone...' : 'Add milestone'}
            </button>
            <button
              className="timeline-secondary-button"
              type="button"
              onClick={() => {
                setTitle('')
                setDescription('')
                setPlannedStartDate(todayString())
                setDueDate('')
                setStatus('Not Started')
                setError('')
                setSuccess('')
              }}
              disabled={saving}
            >
              Clear form
            </button>
          </div>
        </form>
      </section>

      <section className="timeline-panel">
        <div className="timeline-schedule-header">
          <div>
            <h2 className="timeline-panel-title">Milestone schedule</h2>
            <p className="timeline-panel-description">
              Review, edit and update milestone status.
            </p>
          </div>
          <button
            className="timeline-refresh-button"
            type="button"
            onClick={() => void loadMilestones()}
            disabled={loading || saving || !selectedProjectId}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="timeline-loading">Loading milestones...</div>
        ) : milestones.length === 0 ? (
          <div className="timeline-empty-state">
            <h3>No milestones yet</h3>
            <p>Add the first milestone using the form above.</p>
          </div>
        ) : (
          <div className="timeline-milestone-list">
            {milestones.map((milestone) => {
              const overdue =
                milestone.status !== 'Completed' &&
                milestone.due_date < todayString()
              const isEditing = editingId === milestone.id

              return (
                <article className="timeline-milestone" key={milestone.id}>
                  {isEditing ? (
                    <form
                      className="timeline-form"
                      onSubmit={(event) =>
                        void handleUpdateMilestone(event, milestone)
                      }
                    >
                      <h3 className="timeline-milestone-title">
                        Edit milestone
                      </h3>

                      <label>
                        Milestone title *
                        <input
                          required
                          maxLength={200}
                          value={editForm.title}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              title: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label>
                        Status
                        <select
                          value={editForm.status}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              status: event.target.value as MilestoneStatus,
                            })
                          }
                        >
                          {STATUSES.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        Planned start date *
                        <input
                          type="date"
                          required
                          value={editForm.planned_start_date}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              planned_start_date: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label>
                        Due date *
                        <input
                          type="date"
                          required
                          min={editForm.planned_start_date}
                          value={editForm.due_date}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              due_date: event.target.value,
                            })
                          }
                        />
                      </label>

                      <label className="full-width">
                        Description
                        <textarea
                          maxLength={2000}
                          rows={3}
                          value={editForm.description}
                          onChange={(event) =>
                            setEditForm({
                              ...editForm,
                              description: event.target.value,
                            })
                          }
                        />
                      </label>

                      <div className="timeline-form-actions">
                        <button
                          className="timeline-primary-button"
                          type="submit"
                          disabled={saving}
                        >
                          {saving ? 'Saving changes...' : 'Save changes'}
                        </button>
                        <button
                          className="timeline-secondary-button"
                          type="button"
                          onClick={cancelEditing}
                          disabled={saving}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="timeline-milestone-main">
                      <div>
                        <h3 className="timeline-milestone-title">
                          {milestone.title}
                        </h3>
                        {milestone.description && (
                          <p className="timeline-milestone-description">
                            {milestone.description}
                          </p>
                        )}
                        <div className="timeline-milestone-dates">
                          <span>
                            Start: {formatDate(milestone.planned_start_date)}
                          </span>
                          <span>Due: {formatDate(milestone.due_date)}</span>
                        </div>
                      </div>

                      <div className="timeline-badge-group">
                        <StatusBadge status={milestone.status} />
                        {overdue && (
                          <span className="timeline-overdue-badge">
                            Overdue
                          </span>
                        )}
                        <button
                          className="timeline-secondary-button"
                          type="button"
                          onClick={() => startEditing(milestone)}
                          disabled={saving}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string
  value: string
  warning?: boolean
}) {
  return (
    <article
      className={`timeline-summary-card ${warning ? 'warning' : ''}`}
    >
      <p className="timeline-summary-label">{label}</p>
      <p className="timeline-summary-value">{value}</p>
    </article>
  )
}

function FinancialCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <article className="timeline-financial-card">
      <p className="timeline-financial-label">{label}</p>
      <p className="timeline-financial-value">{value}</p>
    </article>
  )
}

function StatusBadge({ status }: { status: MilestoneStatus }) {
  const classes: Record<MilestoneStatus, string> = {
    'Not Started': 'timeline-status-not-started',
    'In Progress': 'timeline-status-in-progress',
    Completed: 'timeline-status-completed',
    'On Hold': 'timeline-status-on-hold',
  }

  return (
    <span className={`timeline-status-badge ${classes[status]}`}>
      {status}
    </span>
  )
}
