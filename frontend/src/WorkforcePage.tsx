import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createAttendance,
  createWorker,
  getAttendance,
  getWorkers,
  getWorkforceSummary,
  updateAttendance,
  type Attendance,
  type AttendanceStatus,
  type Project,
  type Worker,
  type WorkforceSummary,
} from './api'
import './WorkforcePage.css'

type WorkforcePageProps = {
  projects: Project[]
  selectedProjectId: number | null
}

const today = () => new Date().toLocaleDateString('en-CA')

const emptySummary: WorkforceSummary = {
  worker_count: 0,
  attendance_records: 0,
  total_hours: 0,
  labour_cost: 0,
  present_count: 0,
  absent_count: 0,
  half_day_count: 0,
  leave_count: 0,
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function WorkforcePage({
  projects,
  selectedProjectId,
}: WorkforcePageProps) {
  const [projectId, setProjectId] = useState(
    selectedProjectId ? String(selectedProjectId) : '',
  )
  const [workers, setWorkers] = useState<Worker[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [summary, setSummary] = useState<WorkforceSummary>(emptySummary)
  const [attendanceDate, setAttendanceDate] = useState(today())
  const [loading, setLoading] = useState(true)
  const [savingWorker, setSavingWorker] = useState(false)
  const [savingAttendance, setSavingAttendance] = useState(false)
  const [editingAttendanceId, setEditingAttendanceId] = useState<number | null>(
    null,
  )
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [workerName, setWorkerName] = useState('')
  const [workerRole, setWorkerRole] = useState('')
  const [dailyWage, setDailyWage] = useState('')
  const [phone, setPhone] = useState('')

  const [attendanceWorkerId, setAttendanceWorkerId] = useState('')
  const [attendanceStatus, setAttendanceStatus] =
    useState<AttendanceStatus>('Present')
  const [hoursWorked, setHoursWorked] = useState('8')
  const [attendanceNotes, setAttendanceNotes] = useState('')

  useEffect(() => {
    if (selectedProjectId) {
      setProjectId(String(selectedProjectId))
    } else if (projects.length > 0 && !projectId) {
      setProjectId(String(projects[0].id))
    }
  }, [selectedProjectId, projects, projectId])

  const loadWorkforce = useCallback(async () => {
    if (!projectId) {
      setWorkers([])
      setAttendance([])
      setSummary(emptySummary)
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const id = Number(projectId)

      const [workerData, attendanceData, summaryData] = await Promise.all([
        getWorkers(id),
        getAttendance({
          projectId: id,
          startDate: attendanceDate,
          endDate: attendanceDate,
        }),
        getWorkforceSummary({
          projectId: id,
          startDate: attendanceDate,
          endDate: attendanceDate,
        }),
      ])

      setWorkers(workerData)
      setAttendance(attendanceData)
      setSummary(summaryData)

      if (
        !workerData.some(
          (worker) => String(worker.id) === attendanceWorkerId,
        )
      ) {
        setAttendanceWorkerId(
          workerData.length > 0 ? String(workerData[0].id) : '',
        )
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load workforce records.',
      )
    } finally {
      setLoading(false)
    }
  }, [projectId, attendanceDate, attendanceWorkerId])

  useEffect(() => {
    void loadWorkforce()
  }, [loadWorkforce])

  async function handleAddWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!projectId) {
      setError('Create or select a project before adding workers.')
      return
    }

    setSavingWorker(true)

    try {
      await createWorker({
        project_id: Number(projectId),
        name: workerName.trim(),
        role: workerRole.trim(),
        daily_wage: Number(dailyWage),
        phone: phone.trim() || null,
      })

      setWorkerName('')
      setWorkerRole('')
      setDailyWage('')
      setPhone('')
      setNotice('Worker added successfully.')
      await loadWorkforce()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not add worker.',
      )
    } finally {
      setSavingWorker(false)
    }
  }

  function validateAttendance(hours: number): boolean {
    if (!attendanceWorkerId) {
      setError('Select a worker before saving attendance.')
      return false
    }

    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      setError('Hours worked must be between 0 and 24.')
      return false
    }

    if (
      (attendanceStatus === 'Absent' || attendanceStatus === 'Leave') &&
      hours !== 0
    ) {
      setError('Absent and Leave records must have zero working hours.')
      return false
    }

    if (attendanceStatus === 'Half-day' && (hours <= 0 || hours > 4)) {
      setError('Half-day attendance must be more than 0 and no more than 4 hours.')
      return false
    }

    if (attendanceStatus === 'Present' && hours <= 0) {
      setError('Present attendance must have more than zero hours.')
      return false
    }

    return true
  }

  async function handleRecordAttendance(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    setError('')
    setNotice('')

    const hours = Number(hoursWorked)

    if (!validateAttendance(hours)) {
      return
    }

    setSavingAttendance(true)

    try {
      const record = {
        worker_id: Number(attendanceWorkerId),
        attendance_date: attendanceDate,
        hours_worked: hours,
        status: attendanceStatus,
        notes: attendanceNotes.trim() || null,
      }

      if (editingAttendanceId !== null) {
        await updateAttendance(editingAttendanceId, record)
        setNotice('Attendance updated successfully.')
        setEditingAttendanceId(null)
      } else {
        await createAttendance(record)
        setNotice('Attendance recorded successfully.')
      }

      setAttendanceNotes('')
      await loadWorkforce()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : editingAttendanceId !== null
            ? 'Could not update attendance.'
            : 'Could not record attendance.',
      )
    } finally {
      setSavingAttendance(false)
    }
  }

  function handleStatusChange(value: AttendanceStatus) {
    setAttendanceStatus(value)

    if (value === 'Absent' || value === 'Leave') {
      setHoursWorked('0')
    } else if (value === 'Half-day') {
      setHoursWorked('4')
    } else {
      setHoursWorked('8')
    }
  }

  function handleEditAttendance(record: Attendance) {
    setEditingAttendanceId(record.id)
    setAttendanceWorkerId(String(record.worker_id))
    setAttendanceStatus(record.status)
    setHoursWorked(String(record.hours_worked))
    setAttendanceNotes(record.notes || '')
    setError('')
    setNotice('Editing attendance record. Make your changes and save them.')

    window.setTimeout(() => {
      document
        .getElementById('attendance-form-heading')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }

  function handleCancelEdit() {
    setEditingAttendanceId(null)
    setAttendanceStatus('Present')
    setHoursWorked('8')
    setAttendanceNotes('')
    setError('')
    setNotice('Attendance editing cancelled.')
  }

  return (
    <div className="workforce-page">
      <div className="workforce-heading">
        <div>
          <h2>Workforce management</h2>
          <p>Manage site workers, daily attendance and labour costs.</p>
        </div>

        <button
          className="workforce-refresh"
          type="button"
          onClick={() => void loadWorkforce()}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh records'}
        </button>
      </div>

      <section className="workforce-panel workforce-project-select">
        <label htmlFor="workforce-project">Active project</label>
        <select
          id="workforce-project"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value)
            setEditingAttendanceId(null)
            setError('')
            setNotice('')
          }}
        >
          {projects.length === 0 && (
            <option value="">No projects available</option>
          )}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name} — {project.location}
            </option>
          ))}
        </select>

        <label htmlFor="workforce-date">Attendance date</label>
        <input
          id="workforce-date"
          type="date"
          value={attendanceDate}
          onChange={(event) => {
            setAttendanceDate(event.target.value)
            setEditingAttendanceId(null)
            setError('')
            setNotice('')
          }}
        />
      </section>

      {error && (
        <div className="workforce-message workforce-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="workforce-message workforce-success" role="status">
          {notice}
        </div>
      )}

      <div className="workforce-metrics">
        <article className="workforce-metric">
          <span>Total workers</span>
          <strong>{summary.worker_count}</strong>
          <small>Assigned to this project</small>
        </article>

        <article className="workforce-metric">
          <span>Present today</span>
          <strong>{summary.present_count}</strong>
          <small>Recorded as present</small>
        </article>

        <article className="workforce-metric">
          <span>Hours recorded</span>
          <strong>{summary.total_hours}</strong>
          <small>For the selected date</small>
        </article>

        <article className="workforce-metric">
          <span>Labour cost</span>
          <strong>{formatCurrency(summary.labour_cost)}</strong>
          <small>For the selected date</small>
        </article>
      </div>

      <div className="workforce-two-column">
        <section className="workforce-panel">
          <div className="workforce-section-heading">
            <div>
              <h3>Register a worker</h3>
              <p>Add a worker to the selected project.</p>
            </div>
          </div>

          <form className="workforce-form" onSubmit={handleAddWorker}>
            <label htmlFor="worker-name">Full name</label>
            <input
              id="worker-name"
              value={workerName}
              onChange={(event) => setWorkerName(event.target.value)}
              placeholder="e.g. Arun Kumar"
              maxLength={150}
              required
            />

            <label htmlFor="worker-role">Role or trade</label>
            <input
              id="worker-role"
              value={workerRole}
              onChange={(event) => setWorkerRole(event.target.value)}
              placeholder="e.g. Mason, Electrician"
              maxLength={100}
              required
            />

            <label htmlFor="worker-wage">Daily wage (₹)</label>
            <input
              id="worker-wage"
              type="number"
              min="0"
              step="0.01"
              value={dailyWage}
              onChange={(event) => setDailyWage(event.target.value)}
              placeholder="e.g. 900"
              required
            />

            <label htmlFor="worker-phone">Contact number (optional)</label>
            <input
              id="worker-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Phone number"
              maxLength={30}
            />

            <button
              className="workforce-primary-button"
              type="submit"
              disabled={savingWorker || !projectId}
            >
              {savingWorker ? 'Saving worker…' : 'Add worker'}
            </button>
          </form>
        </section>

        <section className="workforce-panel">
          <div className="workforce-section-heading">
            <div>
              <h3 id="attendance-form-heading">
                {editingAttendanceId !== null
                  ? 'Edit attendance'
                  : 'Record attendance'}
              </h3>
              <p>
                {editingAttendanceId !== null
                  ? 'Correct the status, hours or notes, then save.'
                  : 'Record one attendance entry per worker per day.'}
              </p>
            </div>
          </div>

          <form
            className="workforce-form"
            onSubmit={handleRecordAttendance}
          >
            <label htmlFor="attendance-worker">Worker</label>
            <select
              id="attendance-worker"
              value={attendanceWorkerId}
              onChange={(event) => setAttendanceWorkerId(event.target.value)}
              required
              disabled={editingAttendanceId !== null}
            >
              {workers.length === 0 && (
                <option value="">Register a worker first</option>
              )}
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name} — {worker.role}
                </option>
              ))}
            </select>

            <label htmlFor="attendance-status">Attendance status</label>
            <select
              id="attendance-status"
              value={attendanceStatus}
              onChange={(event) =>
                handleStatusChange(event.target.value as AttendanceStatus)
              }
            >
              <option value="Present">Present</option>
              <option value="Half-day">Half-day</option>
              <option value="Absent">Absent</option>
              <option value="Leave">Leave</option>
            </select>

            <label htmlFor="attendance-hours">Hours worked</label>
            <input
              id="attendance-hours"
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={hoursWorked}
              onChange={(event) => setHoursWorked(event.target.value)}
              required
            />

            <label htmlFor="attendance-notes">Notes (optional)</label>
            <textarea
              id="attendance-notes"
              value={attendanceNotes}
              onChange={(event) => setAttendanceNotes(event.target.value)}
              placeholder="Work completed or attendance notes"
              rows={3}
              maxLength={1000}
            />

            <button
              className="workforce-primary-button"
              type="submit"
              disabled={
                savingAttendance ||
                workers.length === 0 ||
                !attendanceWorkerId
              }
            >
              {savingAttendance
                ? 'Saving attendance…'
                : editingAttendanceId !== null
                  ? 'Save attendance changes'
                  : 'Record attendance'}
            </button>

            {editingAttendanceId !== null && (
              <button
                className="workforce-refresh"
                type="button"
                onClick={handleCancelEdit}
                disabled={savingAttendance}
              >
                Cancel editing
              </button>
            )}
          </form>
        </section>
      </div>

      <section className="workforce-panel workforce-table-panel">
        <div className="workforce-section-heading">
          <div>
            <h3>Project workers</h3>
            <p>{workers.length} registered worker(s)</p>
          </div>
        </div>

        {loading ? (
          <p className="workforce-empty">Loading worker records…</p>
        ) : workers.length === 0 ? (
          <p className="workforce-empty">
            No workers registered for this project yet. Add your first worker
            using the form above.
          </p>
        ) : (
          <div className="workforce-table-wrap">
            <table className="workforce-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Role</th>
                  <th>Daily wage</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr key={worker.id}>
                    <td>{worker.name}</td>
                    <td>{worker.role}</td>
                    <td>{formatCurrency(worker.daily_wage)}</td>
                    <td>{worker.phone || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="workforce-panel workforce-table-panel">
        <div className="workforce-section-heading">
          <div>
            <h3>Attendance history</h3>
            <p>Records for {attendanceDate || 'the selected date'}.</p>
          </div>
        </div>

        {loading ? (
          <p className="workforce-empty">Loading attendance records…</p>
        ) : attendance.length === 0 ? (
          <p className="workforce-empty">
            No attendance records for this project on the selected date.
          </p>
        ) : (
          <div className="workforce-table-wrap">
            <table className="workforce-table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Status</th>
                  <th>Hours</th>
                  <th>Labour cost</th>
                  <th>Notes</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((record) => (
                  <tr key={record.id}>
                    <td>
                      {record.worker_name || `Worker ${record.worker_id}`}
                    </td>
                    <td>
                      <span
                        className={`workforce-status workforce-status-${record.status
                          .toLowerCase()
                          .replace('-', '')}`}
                      >
                        {record.status}
                      </span>
                    </td>
                    <td>{record.hours_worked}</td>
                    <td>{formatCurrency(record.labour_cost)}</td>
                    <td>{record.notes || '—'}</td>
                    <td>
                      <button
                        className="workforce-refresh"
                        type="button"
                        onClick={() => handleEditAttendance(record)}
                        disabled={
                          savingAttendance || editingAttendanceId !== null
                        }
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!loading && (
        <p className="workforce-footnote">
          Labour cost is estimated as daily wage × hours worked ÷ 8. Actual
          payroll may differ. Attendance records can now be edited from the
          attendance history table.
        </p>
      )}
    </div>
  )
}

export default WorkforcePage