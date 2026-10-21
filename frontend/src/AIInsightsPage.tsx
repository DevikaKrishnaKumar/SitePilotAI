
import { useEffect, useState } from 'react'
import type {
  Project,
  Milestone,
  Material,
  WorkforceSummary,
  Attendance,
} from './api'
import {
  getMilestones,
  getMaterials,
  getWorkforceSummary,
  getAttendance,
} from './api'
import './AIInsightsPage.css'

type AIInsightsPageProps = {
  projects: Project[]
  selectedProjectId: number | null
  onSelectProject: (projectId: number) => void
}

type Severity = 'High' | 'Medium' | 'Low' | 'Info'

type Insight = {
  title: string
  severity: Severity
  category: string
  details: string
  recommendation: string
}

type SupportingData = {
  milestones: Milestone[] | null
  materials: Material[] | null
  workforce: WorkforceSummary | null
  attendance: Attendance[] | null
}

const EMPTY_DATA: SupportingData = {
  milestones: null,
  materials: null,
  workforce: null,
  attendance: null,
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  })
}

function getLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getDaysUntil(dateString: string, today: string): number {
  const target = new Date(`${dateString}T00:00:00Z`).getTime()
  const current = new Date(`${today}T00:00:00Z`).getTime()

  return Math.round((target - current) / (24 * 60 * 60 * 1000))
}

function getBudgetInsights(project: Project): Insight[] {
  const insights: Insight[] = []
  const { budget, actual_expenditure: expenditure, progress } = project

  if (budget <= 0) {
    insights.push({
      title: 'Budget data unavailable',
      severity: 'Info',
      category: 'Budget',
      details:
        'No positive approved budget is recorded, so budget utilisation cannot be assessed.',
      recommendation:
        'Verify the approved budget before relying on financial risk indicators.',
    })
    return insights
  }

  const budgetUsage = (expenditure / budget) * 100
  const progressGap = budgetUsage - progress

  if (expenditure > budget) {
    insights.push({
      title: 'Approved budget exceeded',
      severity: 'High',
      category: 'Budget',
      details:
        `Expenditure is ${budgetUsage.toFixed(1)}% of budget, exceeding the approved amount by ${formatCurrency(expenditure - budget)}.`,
      recommendation:
        'Review recorded costs, approved variations and the remaining cost forecast.',
    })
  } else if (progressGap >= 20) {
    insights.push({
      title: 'Spending is ahead of reported progress',
      severity: 'High',
      category: 'Budget',
      details:
        `${budgetUsage.toFixed(1)}% of the budget has been spent against ${progress}% reported progress. The gap is ${progressGap.toFixed(1)} percentage points.`,
      recommendation:
        'Review recent expenditure, remaining work and committed costs with the project manager.',
    })
  } else if (progressGap >= 10) {
    insights.push({
      title: 'Budget utilisation needs review',
      severity: 'Medium',
      category: 'Budget',
      details:
        `Budget utilisation is ${budgetUsage.toFixed(1)}%, compared with ${progress}% reported progress.`,
      recommendation:
        'Check whether spending is consistent with the planned construction stages.',
    })
  } else {
    insights.push({
      title: 'No major budget imbalance detected',
      severity: 'Low',
      category: 'Budget',
      details:
        `${budgetUsage.toFixed(1)}% of the approved budget has been spent against ${progress}% reported progress.`,
      recommendation:
        'Continue tracking expenditure and update project progress regularly.',
    })
  }

  const remainingBudget = budget - expenditure

  if (remainingBudget >= 0) {
    insights.push({
      title: 'Remaining budget',
      severity: 'Info',
      category: 'Budget',
      details:
        `${formatCurrency(remainingBudget)} remains from the approved budget.`,
      recommendation:
        'Compare the remaining budget with the cost of work still to be completed.',
    })
  }

  if (progress >= 100 && expenditure < budget) {
    insights.push({
      title: 'Completion requires verification',
      severity: 'Medium',
      category: 'Budget',
      details:
        'Progress is recorded as 100%, but expenditure is below the approved budget.',
      recommendation:
        'Confirm completion records, outstanding invoices and contractual obligations.',
    })
  }

  return insights
}

function getScheduleInsights(
  milestones: Milestone[] | null,
  today: string,
): Insight[] {
  if (milestones === null) {
    return [{
      title: 'Schedule data unavailable',
      severity: 'Info',
      category: 'Schedule',
      details: 'Milestone information could not be loaded.',
      recommendation:
        'Check the timeline service and retry before drawing schedule conclusions.',
    }]
  }

  if (milestones.length === 0) {
    return [{
      title: 'No milestones recorded',
      severity: 'Info',
      category: 'Schedule',
      details: 'This project has no saved milestones to assess.',
      recommendation:
        'Add planned milestones and due dates to enable schedule monitoring.',
    }]
  }

  const insights: Insight[] = []

  for (const milestone of milestones) {
    if (milestone.status === 'Completed') {
      continue
    }

    const daysUntilDue = getDaysUntil(milestone.due_date, today)

    if (daysUntilDue < 0) {
      const daysOverdue = Math.abs(daysUntilDue)

      insights.push({
        title: `Overdue milestone: ${milestone.title}`,
        severity: daysOverdue >= 7 ? 'High' : 'Medium',
        category: 'Schedule',
        details:
          `This milestone was due on ${milestone.due_date} and is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue. Current status: ${milestone.status}.`,
        recommendation:
          'Confirm the actual completion status, identify blockers and agree on a recovery date with the responsible team.',
      })
    } else if (daysUntilDue === 0) {
      insights.push({
        title: `Milestone due today: ${milestone.title}`,
        severity: 'Medium',
        category: 'Schedule',
        details:
          `This milestone is not marked completed and has a due date of ${milestone.due_date}.`,
        recommendation:
          'Confirm progress with the site team and record completion or an updated plan.',
      })
    } else if (daysUntilDue <= 7) {
      insights.push({
        title: `Milestone approaching: ${milestone.title}`,
        severity: 'Low',
        category: 'Schedule',
        details:
          `This milestone is due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'} on ${milestone.due_date}.`,
        recommendation:
          'Check material availability, workforce allocation and dependencies before the due date.',
      })
    }
  }

  if (insights.length === 0) {
    insights.push({
      title: 'No overdue milestones detected',
      severity: 'Low',
      category: 'Schedule',
      details:
        'No incomplete milestones are overdue or due within the next seven days.',
      recommendation:
        'Keep milestone statuses and planned dates up to date.',
    })
  }

  return insights
}

function getMaterialInsights(
  materials: Material[] | null,
): Insight[] {
  if (materials === null) {
    return [{
      title: 'Material data unavailable',
      severity: 'Info',
      category: 'Materials',
      details: 'Inventory information could not be loaded.',
      recommendation:
        'Check the materials service and retry before making procurement decisions.',
    }]
  }

  if (materials.length === 0) {
    return [{
      title: 'No materials recorded',
      severity: 'Info',
      category: 'Materials',
      details: 'No inventory items are registered for this project.',
      recommendation:
        'Register materials and set minimum stock levels to enable stock monitoring.',
    }]
  }

  const lowStockMaterials = materials.filter(
    (material) =>
      Boolean(material.low_stock) ||
      material.current_stock <= material.minimum_stock,
  )

  if (lowStockMaterials.length === 0) {
    return [{
      title: 'No low-stock materials detected',
      severity: 'Low',
      category: 'Materials',
      details:
        `${materials.length} registered material item${materials.length === 1 ? '' : 's'} currently meet their recorded minimum stock requirements.`,
      recommendation:
        'Continue recording stock receipts and usage to keep inventory figures accurate.',
    }]
  }

  return lowStockMaterials.map((material) => ({
    title: `Low stock: ${material.name}`,
    severity: material.current_stock <= 0 ? 'High' : 'Medium',
    category: 'Materials',
    details:
      `${material.name} has ${material.current_stock} ${material.unit} available against a minimum level of ${material.minimum_stock} ${material.unit}.`,
    recommendation:
      material.current_stock <= 0
        ? 'Verify the physical stock immediately and arrange replenishment if work depends on this material.'
        : 'Review upcoming material requirements and coordinate replenishment with the supplier.',
  }))
}

function getWorkforceInsights(
  workforce: WorkforceSummary | null,
  attendance: Attendance[] | null,
): Insight[] {
  if (workforce === null || attendance === null) {
    return [{
      title: 'Workforce data unavailable',
      severity: 'Info',
      category: 'Workforce',
      details: 'Workforce or recent attendance information could not be loaded.',
      recommendation:
        'Check the workforce service and retry before drawing staffing conclusions.',
    }]
  }

  if (workforce.worker_count === 0) {
    return [{
      title: 'No workers registered',
      severity: 'Info',
      category: 'Workforce',
      details:
        'No workers are registered for this project, so workforce availability cannot be assessed.',
      recommendation:
        'Register the project workforce if labour tracking is required.',
    }]
  }

  if (attendance.length === 0) {
    return [{
      title: 'No recent attendance records',
      severity: 'Info',
      category: 'Workforce',
      details:
        'No attendance records were found for the last seven calendar days.',
      recommendation:
        'Confirm whether attendance is being recorded consistently before assessing workforce availability.',
    }]
  }

  const absentCount = attendance.filter(
    (record) => record.status === 'Absent',
  ).length

  const totalRecords = attendance.length
  const absenceRate = (absentCount / totalRecords) * 100
  const insights: Insight[] = []

  if (absentCount > 0) {
    insights.push({
      title: 'Recorded worker absences',
      severity: absenceRate >= 25 ? 'High' : 'Medium',
      category: 'Workforce',
      details:
        `${absentCount} of ${totalRecords} attendance records in the last seven calendar days are marked absent (${absenceRate.toFixed(1)}%). This is a record-based indicator, not a measure of all scheduled workers.`,
      recommendation:
        'Confirm staffing requirements with the site supervisor and arrange cover if critical work is affected.',
    })
  }

  const halfDayCount = attendance.filter(
    (record) => record.status === 'Half-day',
  ).length

  if (halfDayCount > 0) {
    insights.push({
      title: 'Half-day attendance recorded',
      severity: 'Low',
      category: 'Workforce',
      details:
        `${halfDayCount} attendance record${halfDayCount === 1 ? '' : 's'} in the selected period are marked half-day.`,
      recommendation:
        'Check planned labour hours against the work schedule where staffing capacity is important.',
    })
  }

  if (insights.length === 0) {
    insights.push({
      title: 'No absences recorded in recent attendance',
      severity: 'Low',
      category: 'Workforce',
      details:
        `${totalRecords} attendance records were reviewed for the last seven calendar days; none are marked absent or half-day.`,
      recommendation:
        'Continue recording attendance accurately and compare staffing with upcoming work requirements.',
    })
  }

  return insights
}

const severityOrder: Record<Severity, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
  Info: 3,
}

function AIInsightsPage({
  projects,
  selectedProjectId,
  onSelectProject,
}: AIInsightsPageProps) {
  const project =
    projects.find((item) => item.id === selectedProjectId) ?? null

  const [supportingData, setSupportingData] =
    useState<SupportingData>(EMPTY_DATA)
  const [isLoading, setIsLoading] = useState(false)
  const [loadMessage, setLoadMessage] = useState('')

  useEffect(() => {
    if (project === null) {
      setSupportingData(EMPTY_DATA)
      setIsLoading(false)
      setLoadMessage('')
      return
    }

    let cancelled = false

    async function loadInsightsData() {
      setIsLoading(true)
      setLoadMessage('')

      const today = new Date()
      const endDate = getLocalDateString(today)
      const start = new Date(today)
      start.setDate(start.getDate() - 6)
      const startDate = getLocalDateString(start)

      const results = await Promise.allSettled([
        getMilestones(project!.id),
        getMaterials(project!.id),
        getWorkforceSummary({ projectId: project!.id }),
        getAttendance({
          projectId: project!.id,
          startDate,
          endDate,
        }),
      ])

      if (cancelled) {
        return
      }

      const [milestoneResult, materialResult, workforceResult, attendanceResult] =
        results

      setSupportingData({
        milestones:
          milestoneResult.status === 'fulfilled'
            ? milestoneResult.value
            : null,
        materials:
          materialResult.status === 'fulfilled'
            ? materialResult.value
            : null,
        workforce:
          workforceResult.status === 'fulfilled'
            ? workforceResult.value
            : null,
        attendance:
          attendanceResult.status === 'fulfilled'
            ? attendanceResult.value
            : null,
      })

      const failedCount = results.filter(
        (result) => result.status === 'rejected',
      ).length

      if (failedCount > 0) {
        setLoadMessage(
          `${failedCount} data source${failedCount === 1 ? '' : 's'} could not be loaded. Findings for unavailable data will be labelled accordingly.`,
        )
      }

      setIsLoading(false)
    }

    void loadInsightsData()

    return () => {
      cancelled = true
    }
  }, [project?.id])

  if (!project) {
    return (
      <section className="ai-insights-page">
        <div className="ai-insights-heading">
          <p className="eyebrow">PROJECT INTELLIGENCE</p>
          <h3>AI Insights &amp; Decision Support</h3>
          <p>
            Create or select a project to review indicators from its recorded
            data.
          </p>
        </div>
        <div className="ai-insight-card">
          <h4>No project selected</h4>
          <p>Insights will appear here once project data is available.</p>
        </div>
      </section>
    )
  }

  const budgetUsage =
    project.budget > 0
      ? (project.actual_expenditure / project.budget) * 100
      : null

  const today = getLocalDateString(new Date())

  const insights = [
    ...getBudgetInsights(project),
    ...getScheduleInsights(supportingData.milestones, today),
    ...getMaterialInsights(supportingData.materials),
    ...getWorkforceInsights(
      supportingData.workforce,
      supportingData.attendance,
    ),
  ].sort(
    (first, second) =>
      severityOrder[first.severity] - severityOrder[second.severity],
  )

  const highCount = insights.filter(
    (item) => item.severity === 'High',
  ).length

  const mediumCount = insights.filter(
    (item) => item.severity === 'Medium',
  ).length

  return (
    <section className="ai-insights-page">
      <div className="ai-insights-heading">
        <p className="eyebrow">PROJECT INTELLIGENCE</p>
        <h3>AI Insights &amp; Decision Support</h3>
        <p>
          Review budget, schedule, materials and workforce indicators to
          identify items that may need human attention.
        </p>
      </div>

      <div className="ai-insights-toolbar">
        <label>
          <span>Select project</span>
          <select
            value={project.id}
            onChange={(event) =>
              onSelectProject(Number(event.target.value))
            }
          >
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <span className="ai-analysis-label">Rule-based analysis</span>
      </div>

      <div className="ai-insight-card">
        <div className="ai-project-title">
          <div>
            <p className="eyebrow">SELECTED PROJECT</p>
            <h4>{project.name}</h4>
            <p>{project.project_type} · {project.location}</p>
          </div>
          <span className="ai-analysis-label">Project review</span>
        </div>

        <div className="ai-metrics-grid">
          <article className="ai-metric">
            <span>Approved budget</span>
            <strong>{formatCurrency(project.budget)}</strong>
          </article>
          <article className="ai-metric">
            <span>Actual expenditure</span>
            <strong>{formatCurrency(project.actual_expenditure)}</strong>
          </article>
          <article className="ai-metric">
            <span>Reported progress</span>
            <strong>{project.progress}%</strong>
          </article>
          <article className="ai-metric">
            <span>Budget utilised</span>
            <strong>
              {budgetUsage === null
                ? 'Unavailable'
                : `${budgetUsage.toFixed(1)}%`}
            </strong>
          </article>
        </div>
      </div>

      <div className="ai-insights-section-heading">
        <div>
          <h4>Prioritised project findings</h4>
          <p>
            Findings are ordered by severity. Review each item before taking
            action.
          </p>
        </div>
        <span>{insights.length} findings</span>
      </div>

      {isLoading && (
        <div className="ai-insight-card">
          <p>Loading milestone, inventory and workforce information…</p>
        </div>
      )}

      {loadMessage && (
        <div className="ai-human-review-note">
          <strong>Partial data available</strong>
          <p>{loadMessage}</p>
        </div>
      )}

      <div className="ai-metrics-grid">
        <article className="ai-metric">
          <span>High priority</span>
          <strong>{highCount}</strong>
        </article>
        <article className="ai-metric">
          <span>Medium priority</span>
          <strong>{mediumCount}</strong>
        </article>
        <article className="ai-metric">
          <span>Milestones loaded</span>
          <strong>
            {supportingData.milestones === null
              ? '—'
              : supportingData.milestones.length}
          </strong>
        </article>
        <article className="ai-metric">
          <span>Materials loaded</span>
          <strong>
            {supportingData.materials === null
              ? '—'
              : supportingData.materials.length}
          </strong>
        </article>
      </div>

      <div className="ai-findings-list">
        {insights.map((insight, index) => (
          <article
            className="ai-finding-card"
            key={`${insight.category}-${insight.title}-${index}`}
          >
            <div className="ai-finding-top">
              <h4>{insight.title}</h4>
              <span
                className={`ai-severity ${insight.severity.toLowerCase()}`}
              >
                {insight.severity}
              </span>
            </div>
            <p className="ai-analysis-label">{insight.category}</p>
            <p>{insight.details}</p>
            <div className="ai-recommendation">
              <strong>Recommended action</strong>
              <p>{insight.recommendation}</p>
            </div>
          </article>
        ))}
      </div>

      <div className="ai-human-review-note">
        <strong>Important — human review required</strong>
        <p>
          These findings use transparent rules applied to recorded project
          data. They are not predictions from a trained machine-learning model
          or a large language model. Attendance records do not necessarily
          represent all scheduled workers, and low stock does not automatically
          mean a construction delay. Verify the source data and operational
          context before taking action.
        </p>
      </div>
    </section>
  )
}

export default AIInsightsPage
