
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createSiteReport,
  getSiteReport,
  getSiteReports,
  type Project,
  type SiteReport,
  type SiteReportCreate,
  type SiteReportSeverity,
} from './api'
import './SiteReportsPage.css'

type SiteReportsPageProps = {
  projects: Project[]
  selectedProjectId: number | null
}

function getTodayDate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function createEmptyForm(projectId: number | null): SiteReportCreate {
  return {
    project_id: projectId ?? 0,
    report_date: getTodayDate(),
    site_progress: null,
    work_completed: '',
    delays: '',
    safety_observations: '',
    materials_used: '',
    general_notes: '',
  }
}

function formatDate(date: string) {
  if (!date) return 'Date not available'

  const parsedDate = new Date(`${date.slice(0, 10)}T00:00:00`)

  if (Number.isNaN(parsedDate.getTime())) return date

  return parsedDate.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getSeverityClass(severity: SiteReportSeverity) {
  return `report-severity report-severity-${severity.toLowerCase()}`
}

function SiteReportsPage({
  projects,
  selectedProjectId,
}: SiteReportsPageProps) {
  // This selector controls the project shown on the Site Reports page.
  const [activeProjectId, setActiveProjectId] =
    useState<number | null>(selectedProjectId)

  const [formData, setFormData] = useState<SiteReportCreate>(() =>
    createEmptyForm(selectedProjectId),
  )
  const [reports, setReports] = useState<SiteReport[]>([])
  const [selectedReport, setSelectedReport] = useState<SiteReport | null>(null)
  const [loadingReports, setLoadingReports] = useState(false)
  const [loadingReportId, setLoadingReportId] = useState<number | null>(null)
  const [loadingSelectedReport, setLoadingSelectedReport] = useState(false)
  const [savingReport, setSavingReport] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedProject =
    projects.find((project) => project.id === activeProjectId) ?? null

  // Keep the page in sync if the project is changed elsewhere in the app.
  useEffect(() => {
    setActiveProjectId(selectedProjectId)
  }, [selectedProjectId])

  const loadReports = useCallback(async () => {
    if (activeProjectId === null) {
      setReports([])
      setSelectedReport(null)
      setLoadingReports(false)
      return
    }

    setLoadingReports(true)
    setError('')

    try {
      const data = await getSiteReports({
        projectId: activeProjectId,
      })

      setReports(data)

      // Keep the current report selected if it belongs to this project.
      setSelectedReport((current) => {
        if (!current) return null

        return data.find((report) => report.id === current.id) ?? null
      })
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load site reports.',
      )
    } finally {
      setLoadingReports(false)
    }
  }, [activeProjectId])

  // Refresh the form and history whenever the page's project changes.
  useEffect(() => {
    setFormData(createEmptyForm(activeProjectId))
    setSelectedReport(null)
    setMessage('')
    setError('')
    void loadReports()
  }, [activeProjectId, loadReports])

  function handleProjectChange(value: string) {
    const projectId = value === '' ? null : Number(value)

    setActiveProjectId(
      projectId !== null && Number.isFinite(projectId) ? projectId : null,
    )
  }

  function updateForm<K extends keyof SiteReportCreate>(
    field: K,
    value: SiteReportCreate[K],
  ) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (activeProjectId === null) {
      setError('Please select a project before submitting a site report.')
      return
    }

    if (!formData.work_completed.trim()) {
      setError('Please describe the work completed before submitting.')
      return
    }

    setSavingReport(true)
    setError('')
    setMessage('')

    const payload: SiteReportCreate = {
      ...formData,
      project_id: activeProjectId,
      work_completed: formData.work_completed.trim(),
      delays: formData.delays.trim(),
      safety_observations: formData.safety_observations.trim(),
      materials_used: formData.materials_used.trim(),
      general_notes: formData.general_notes.trim(),
    }

    try {
      const savedReport = await createSiteReport(payload)

      setSelectedReport(savedReport)
      setMessage('Site report saved and analysis generated.')
      setFormData(createEmptyForm(activeProjectId))

      // Refresh the history, but retain the newly saved report in the viewer.
      await loadReports()
      setSelectedReport(savedReport)
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not save the site report.',
      )
    } finally {
      setSavingReport(false)
    }
  }

  async function handleSelectReport(reportId: number) {
    setLoadingReportId(reportId)
    setLoadingSelectedReport(true)
    setError('')
    setMessage('')

    // Show the history item's available details immediately while requesting
    // the full report from the backend.
    const cachedReport = reports.find((report) => report.id === reportId)

    if (cachedReport) {
      setSelectedReport(cachedReport)
    }

    try {
      const report = await getSiteReport(reportId)
      setSelectedReport(report)
    } catch (selectError) {
      // If the detail request fails, keep the cached report visible if possible.
      if (!cachedReport) {
        setSelectedReport(null)
      }

      setError(
        selectError instanceof Error
          ? `Could not load the full report. ${selectError.message}`
          : 'Could not load the full report. Please try again.',
      )
    } finally {
      setLoadingReportId(null)
      setLoadingSelectedReport(false)
    }
  }

  return (
    <div className="site-reports-page">
      <section className="report-intro">
        <div className="report-intro-icon" aria-hidden="true">
          SR
        </div>
        <div>
          <p className="report-eyebrow">SITE OPERATIONS</p>
          <h3>Daily site reports</h3>
          <p>
            Record site activity and review potential risks and follow-up
            actions identified from the report.
          </p>
        </div>
      </section>

      {/* Project selector */}
      <section className="panel" style={{ marginBottom: '20px' }}>
        <div className="panel-heading">
          <div>
            <h3>Select construction project</h3>
            <p>
              Choose a project to create a report or view its saved report
              history.
            </p>
          </div>
        </div>

        <label
          className="site-report-field"
          htmlFor="site-report-project-select"
        >
          Project
          <select
            id="site-report-project-select"
            value={activeProjectId ?? ''}
            onChange={(event) => handleProjectChange(event.target.value)}
            disabled={projects.length === 0}
          >
            <option value="">Select a project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {!selectedProject && (
        <div className="report-notice" role="status">
          {projects.length === 0
            ? 'No projects are available yet. Create a project before submitting a site report.'
            : 'Select a project above to create a report and view its history.'}
        </div>
      )}

      {error && (
        <div className="report-message report-message-error" role="alert">
          <strong>Something needs attention</strong>
          <p>{error}</p>
        </div>
      )}

      {message && (
        <div className="report-message report-message-success" role="status">
          {message}
        </div>
      )}

      <div className="report-workspace">
        <section className="panel report-form-panel">
          <div className="panel-heading">
            <div>
              <h3>New daily report</h3>
              <p>
                Project:{' '}
                <strong>
                  {selectedProject?.name ?? 'No project selected'}
                </strong>
              </p>
            </div>
            <span className="report-form-tag">DAILY LOG</span>
          </div>

          <form className="site-report-form" onSubmit={handleSubmit}>
            <div className="site-report-field-grid">
              <label className="site-report-field">
                Report date
                <input
                  type="date"
                  required
                  value={formData.report_date}
                  onChange={(event) =>
                    updateForm('report_date', event.target.value)
                  }
                />
              </label>

              <label className="site-report-field">
                Site progress (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="e.g. 65"
                  value={formData.site_progress ?? ''}
                  onChange={(event) => {
                    const value = event.target.value
                    updateForm(
                      'site_progress',
                      value === '' ? null : Number(value),
                    )
                  }}
                />
                <span className="report-field-hint">
                  Leave blank if progress was not measured.
                </span>
              </label>
            </div>

            <label className="site-report-field">
              Work completed <span className="required-mark">*</span>
              <textarea
                required
                rows={3}
                maxLength={3000}
                value={formData.work_completed}
                onChange={(event) =>
                  updateForm('work_completed', event.target.value)
                }
                placeholder="Describe work completed today, including the work area or activity."
              />
            </label>

            <label className="site-report-field">
              Delays or obstructions
              <textarea
                rows={3}
                maxLength={3000}
                value={formData.delays}
                onChange={(event) => updateForm('delays', event.target.value)}
                placeholder="Mention weather, delivery, equipment, labour, or other delays. Enter None if there were no delays."
              />
            </label>

            <label className="site-report-field">
              Safety observations
              <textarea
                rows={3}
                maxLength={3000}
                value={formData.safety_observations}
                onChange={(event) =>
                  updateForm('safety_observations', event.target.value)
                }
                placeholder="Record safety observations, hazards, PPE reminders, or corrective measures."
              />
            </label>

            <label className="site-report-field">
              Materials used or required
              <textarea
                rows={3}
                maxLength={3000}
                value={formData.materials_used}
                onChange={(event) =>
                  updateForm('materials_used', event.target.value)
                }
                placeholder="List materials consumed, pending deliveries, or possible shortages."
              />
            </label>

            <label className="site-report-field">
              General notes
              <textarea
                rows={3}
                maxLength={3000}
                value={formData.general_notes}
                onChange={(event) =>
                  updateForm('general_notes', event.target.value)
                }
                placeholder="Other observations, supervisor comments, or planned follow-ups."
              />
            </label>

            <div className="report-form-footer">
              <p>
                Required: report date and completed work. Other observations
                can be left blank.
              </p>
              <button
                className="primary-button"
                type="submit"
                disabled={savingReport || activeProjectId === null}
              >
                {savingReport ? 'Saving report...' : 'Save & Analyse Report'}
              </button>
            </div>
          </form>
        </section>

        <aside className="report-history-panel">
          <section className="panel report-history-card">
            <div className="panel-heading">
              <div>
                <h3>Report history</h3>
                <p>
                  {selectedProject
                    ? `Saved reports for ${selectedProject.name}`
                    : 'Select a project to view saved reports'}
                </p>
              </div>
              <span className="report-count">{reports.length}</span>
            </div>

            {loadingReports ? (
              <div className="report-empty-state" role="status">
                <span className="report-loading-dot" />
                <p>Loading reports...</p>
              </div>
            ) : activeProjectId === null ? (
              <div className="report-empty-state">
                <strong>No project selected</strong>
                <p>Select a project above to view its report history.</p>
              </div>
            ) : reports.length === 0 ? (
              <div className="report-empty-state">
                <div className="report-empty-icon" aria-hidden="true">
                  +
                </div>
                <strong>No reports yet</strong>
                <p>
                  Submit the first daily report to start a record of site
                  activity and analysis.
                </p>
              </div>
            ) : (
              <div className="report-history-list">
                {reports.map((report) => (
                  <button
                    key={report.id}
                    type="button"
                    className={
                      selectedReport?.id === report.id
                        ? 'report-history-item selected'
                        : 'report-history-item'
                    }
                    onClick={() => void handleSelectReport(report.id)}
                    disabled={loadingReportId !== null}
                    aria-pressed={selectedReport?.id === report.id}
                  >
                    <span className="report-history-date">
                      {formatDate(report.report_date)}
                    </span>
                    <strong>
                      {report.project_name ||
                        selectedProject?.name ||
                        'Site report'}
                    </strong>
                    <span className="report-history-summary">
                      {report.analysis?.summary ||
                        report.work_completed ||
                        'No summary available.'}
                    </span>
                    <span className="report-history-bottom">
                      <span>
                        Progress: {report.site_progress ?? 'Not recorded'}
                        {report.site_progress === null ? '' : '%'}
                      </span>
                      <span className="report-history-open">
                        {loadingReportId === report.id
                          ? 'Opening...'
                          : selectedReport?.id === report.id
                            ? 'Selected ✓'
                            : 'View report →'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="report-honesty-note">
            <strong>About this analysis</strong>
            <p>
              Findings are generated by the application's local rule-based
              screening of report text. They are suggestions for human review,
              not verified site conditions or certified engineering advice.
            </p>
          </div>
        </aside>
      </div>

      <section className="panel report-analysis-panel">
        <div className="panel-heading report-analysis-heading">
          <div>
            <p className="report-eyebrow">REVIEW & FOLLOW-UP</p>
            <h3>Report analysis</h3>
            <p>
              {selectedReport
                ? `Report from ${formatDate(selectedReport.report_date)}`
                : 'Save a report or select one from the history to review its findings.'}
            </p>
          </div>
          {selectedReport && (
            <span className="report-analysis-badge">Analysis available</span>
          )}
        </div>

        {loadingSelectedReport && (
          <div className="report-notice" role="status">
            Loading the full report and analysis...
          </div>
        )}

        {!selectedReport ? (
          <div className="report-empty-analysis">
            <div className="report-empty-icon" aria-hidden="true">
              ✳
            </div>
            <h4>No report selected</h4>
            <p>
              The report summary, potential issues, and recommended follow-ups
              will appear here.
            </p>
          </div>
        ) : (
          <div className="report-analysis-content">
            <section className="report-summary-card">
              <div className="report-analysis-section-title">
                <span className="report-analysis-icon">≡</span>
                <h4>Summary</h4>
              </div>
              <p>
                {selectedReport.analysis?.summary || 'No summary available.'}
              </p>
            </section>

            <section className="report-analysis-section">
              <div className="report-analysis-section-title">
                <span className="report-analysis-icon report-warning-icon">
                  !
                </span>
                <div>
                  <h4>Potential issues</h4>
                  <p>
                    {selectedReport.analysis?.issues?.length ?? 0} finding(s)
                    identified for review
                  </p>
                </div>
              </div>

              {!selectedReport.analysis?.issues?.length ? (
                <div className="report-no-issues">
                  No potential issues were identified by the current screening
                  rules. This does not guarantee that the site is risk-free.
                </div>
              ) : (
                <div className="report-issues-list">
                  {selectedReport.analysis.issues.map((issue, index) => (
                    <article
                      className="report-issue-card"
                      key={`${selectedReport.id}-${issue.title}-${index}`}
                    >
                      <div className="report-issue-top">
                        <span className={getSeverityClass(issue.severity)}>
                          {issue.severity}
                        </span>
                        <span className="report-issue-number">
                          Finding {index + 1}
                        </span>
                      </div>
                      <h5>{issue.title}</h5>
                      <p className="report-issue-details">{issue.details}</p>
                      <div className="report-recommendation">
                        <strong>Recommended action</strong>
                        <p>{issue.recommended_action}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="report-analysis-section">
              <div className="report-analysis-section-title">
                <span className="report-analysis-icon report-action-icon">
                  ✓
                </span>
                <div>
                  <h4>Follow-up actions</h4>
                  <p>Suggested next steps for the project team</p>
                </div>
              </div>

              {!selectedReport.analysis?.follow_up_actions?.length ? (
                <p className="report-muted-text">
                  No follow-up actions were returned for this report.
                </p>
              ) : (
                <ol className="report-follow-up-list">
                  {selectedReport.analysis.follow_up_actions.map(
                    (action, index) => (
                      <li key={`${selectedReport.id}-action-${index}`}>
                        <span>{index + 1}</span>
                        <p>{action}</p>
                      </li>
                    ),
                  )}
                </ol>
              )}
            </section>

            <details className="report-source-details">
              <summary>View original report details</summary>
              <div className="report-source-grid">
                <div>
                  <strong>Project</strong>
                  <p>
                    {selectedReport.project_name ||
                      selectedProject?.name ||
                      'Project details unavailable'}
                  </p>
                </div>
                <div>
                  <strong>Report date</strong>
                  <p>{formatDate(selectedReport.report_date)}</p>
                </div>
                <div>
                  <strong>Site progress</strong>
                  <p>
                    {selectedReport.site_progress === null
                      ? 'Not recorded'
                      : `${selectedReport.site_progress}%`}
                  </p>
                </div>
                <div>
                  <strong>Work completed</strong>
                  <p>{selectedReport.work_completed || 'Not provided'}</p>
                </div>
                <div>
                  <strong>Delays or obstructions</strong>
                  <p>{selectedReport.delays || 'Not provided'}</p>
                </div>
                <div>
                  <strong>Safety observations</strong>
                  <p>
                    {selectedReport.safety_observations || 'Not provided'}
                  </p>
                </div>
                <div>
                  <strong>Materials used or required</strong>
                  <p>{selectedReport.materials_used || 'Not provided'}</p>
                </div>
                <div>
                  <strong>General notes</strong>
                  <p>{selectedReport.general_notes || 'Not provided'}</p>
                </div>
              </div>
            </details>
          </div>
        )}
      </section>
    </div>
  )
}

export default SiteReportsPage
