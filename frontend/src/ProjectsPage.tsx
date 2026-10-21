
import { useMemo, useState } from 'react'
import './ProjectsPage.css'
import type { Project } from './api'

type ProjectsPageProps = {
  projects: Project[]
  onSelectProject: (projectId: number) => void
  onCreateProject: () => void
  onEditProject: (projectId: number) => void
}

function ProjectsPage({
  projects,
  onSelectProject,
  onCreateProject,
  onEditProject,
}: ProjectsPageProps) {
  const [search, setSearch] = useState('')

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return projects

    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.location.toLowerCase().includes(query) ||
        project.project_type.toLowerCase().includes(query),
    )
  }, [projects, search])

  const formatCurrency = (amount: number) =>
    `₹${(amount / 100000).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
    })}L`

  return (
    <section className="projects-page">
      <div className="projects-toolbar">
        <div>
          <h3>All projects</h3>
          <p>
            {projects.length} saved{' '}
            {projects.length === 1 ? 'project' : 'projects'} in your workspace
          </p>
        </div>

        <button className="primary-button" onClick={onCreateProject}>
          + New Project
        </button>
      </div>

      <div className="projects-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by project, location, or type..."
          aria-label="Search projects"
        />
      </div>

      <div className="projects-table-wrapper">
        <table className="projects-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Type</th>
              <th>Progress</th>
              <th>Budget</th>
              <th>Expenditure</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filteredProjects.map((project) => (
              <tr key={project.id}>
                <td>
                  <button
                    className="project-name-button"
                    onClick={() => onSelectProject(project.id)}
                  >
                    {project.name}
                  </button>
                  <span className="project-location">
                    {project.location}
                  </span>
                </td>

                <td>{project.project_type}</td>

                <td>
                  <div className="table-progress">
                    <div className="table-progress-track">
                      <div
                        className="table-progress-fill"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span>{project.progress}%</span>
                  </div>
                </td>

                <td>{formatCurrency(project.budget)}</td>
                <td>{formatCurrency(project.actual_expenditure)}</td>

                <td>
                  <button
                    className="text-button"
                    onClick={() => onEditProject(project.id)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}

            {filteredProjects.length === 0 && (
              <tr>
                <td colSpan={6} className="projects-empty">
                  {projects.length === 0
                    ? 'No projects yet. Create your first project.'
                    : 'No projects match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="projects-footnote">
        Project figures are illustrative demo data.
      </p>
    </section>
  )
}

export default ProjectsPage
