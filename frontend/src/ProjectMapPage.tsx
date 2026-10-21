
import { useEffect, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { Project } from './api'
import './ProjectMapPage.css'

type ProjectMapPageProps = {
  projects: Project[]
}

type Coordinates = {
  lat: number
  lng: number
  label: string
}

// These are approximate city-centre coordinates, not construction-site coordinates.
function getCityCoordinates(location: string): Coordinates | null {
  const normalized = location.toLowerCase()

  if (
    normalized.includes('kozhikode') ||
    normalized.includes('calicut')
  ) {
    return {
      lat: 11.2588,
      lng: 75.7804,
      label: 'Kozhikode city centre',
    }
  }

  return null
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function MapFocus({
  coordinates,
}: {
  coordinates: Coordinates | null
}) {
  const map = useMap()

  useEffect(() => {
    if (coordinates) {
      map.flyTo([coordinates.lat, coordinates.lng], 12, {
        duration: 0.8,
      })
    }
  }, [coordinates, map])

  return null
}

export default function ProjectMapPage({
  projects,
}: ProjectMapPageProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  )

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null

  const selectedCoordinates = selectedProject
    ? getCityCoordinates(selectedProject.location)
    : null

  const mappedProjects = projects.filter((project) =>
    Boolean(getCityCoordinates(project.location)),
  )

  const unmappedProjects = projects.filter(
    (project) => !getCityCoordinates(project.location),
  )

  return (
    <section className="project-map-page">
      <div className="project-map-heading">
        <div>
          <p className="project-map-eyebrow">SITE LOCATIONS</p>
          <h2>Project Map</h2>
          <p>
            Explore project locations and review their current progress.
          </p>
        </div>

        <div className="project-map-count">
          <strong>{projects.length}</strong>
          <span>Total projects</span>
        </div>
      </div>

      <div className="project-map-notice">
        <strong>Location accuracy:</strong> Markers show approximate city
        centres. They do not represent verified construction-site coordinates.
      </div>

      <div className="project-map-layout">
        <div className="project-map-panel">
          <MapContainer
            center={[11.2588, 75.7804]}
            zoom={10}
            scrollWheelZoom
            className="project-map-canvas"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapFocus coordinates={selectedCoordinates} />

            {mappedProjects.map((project) => {
              const coordinates = getCityCoordinates(project.location)

              if (!coordinates) return null

              return (
                <CircleMarker
                  key={project.id}
                  center={[coordinates.lat, coordinates.lng]}
                  radius={selectedProjectId === project.id ? 11 : 8}
                  pathOptions={{
                    color: selectedProjectId === project.id
                      ? '#0f766e'
                      : '#2563eb',
                    fillColor: selectedProjectId === project.id
                      ? '#14b8a6'
                      : '#60a5fa',
                    fillOpacity: 0.85,
                    weight: 2,
                  }}
                  eventHandlers={{
                    click: () => setSelectedProjectId(project.id),
                  }}
                >
                  <Popup>
                    <strong>{project.name}</strong>
                    <br />
                    {project.project_type}
                    <br />
                    Progress: {project.progress}%
                    <br />
                    Approximate location: {coordinates.label}
                  </Popup>
                </CircleMarker>
              )
            })}
          </MapContainer>

          <div className="project-map-caption">
            <span className="project-map-legend-dot" />
            Approximate city-level project location
          </div>
        </div>

        <aside className="project-map-sidebar">
          <div className="project-map-list-heading">
            <h3>Project locations</h3>
            <span>{mappedProjects.length} mapped</span>
          </div>

          {projects.length === 0 ? (
            <p className="project-map-empty">
              No projects are available yet. Create a project to see it here.
            </p>
          ) : (
            <div className="project-map-project-list">
              {projects.map((project) => {
                const coordinates = getCityCoordinates(project.location)
                const isSelected = selectedProjectId === project.id

                return (
                  <button
                    key={project.id}
                    type="button"
                    className={`project-map-project-card${isSelected ? ' is-selected' : ''}`}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <div className="project-map-card-top">
                      <strong>{project.name}</strong>
                      <span
                        className={`project-map-status${coordinates ? ' is-mapped' : ' is-unmapped'}`}
                      >
                        {coordinates ? 'Mapped' : 'Not mapped'}
                      </span>
                    </div>

                    <p>{project.location}</p>
                    <p className="project-map-project-type">
                      {project.project_type}
                    </p>

                    <div className="project-map-progress-label">
                      <span>Progress</span>
                      <strong>{project.progress}%</strong>
                    </div>

                    <div className="project-map-progress-track">
                      <div
                        className="project-map-progress-fill"
                        style={{
                          width: `${Math.min(100, Math.max(0, project.progress))}%`,
                        }}
                      />
                    </div>

                    <div className="project-map-budget">
                      <span>Budget</span>
                      <strong>{formatCurrency(project.budget)}</strong>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {unmappedProjects.length > 0 && (
            <div className="project-map-unmapped-note">
              <strong>{unmappedProjects.length} location(s) need mapping</strong>
              <p>
                These projects are listed above, but their locations are not
                yet supported by this map. No coordinates have been guessed.
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
