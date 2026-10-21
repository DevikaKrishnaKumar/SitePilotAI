
from contextlib import asynccontextmanager, contextmanager
from datetime import date
import json
import sqlite3
from pathlib import Path
from typing import Literal


from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from auth import (
    get_session_username,
    require_csrf,
    router as auth_router,
)


BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "sitepilot.db"


# -------------------- REQUEST MODELS --------------------

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    location: str = Field(min_length=1, max_length=200)
    project_type: str = Field(min_length=1, max_length=100)
    progress: float = Field(ge=0, le=100)
    budget: float = Field(ge=0)
    actual_expenditure: float = Field(ge=0)


class ProjectUpdate(ProjectCreate):
    pass


class WorkerCreate(BaseModel):
    project_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=150)
    role: str = Field(min_length=1, max_length=100)
    daily_wage: float = Field(ge=0)
    phone: str | None = Field(default=None, max_length=30)


class WorkerUpdate(WorkerCreate):
    pass


class AttendanceCreate(BaseModel):
    worker_id: int = Field(gt=0)
    attendance_date: date
    hours_worked: float = Field(ge=0, le=24)
    status: Literal["Present", "Absent", "Half-day", "Leave"]
    notes: str | None = Field(default=None, max_length=1000)


class MaterialCreate(BaseModel):
    project_id: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=150)
    unit: str = Field(min_length=1, max_length=30)
    opening_stock: float = Field(ge=0)
    minimum_stock: float = Field(ge=0)
    unit_price: float = Field(ge=0)
    supplier: str | None = Field(default=None, max_length=150)


class MaterialTransactionCreate(BaseModel):
    material_id: int = Field(gt=0)
    transaction_type: Literal["Received", "Used"]
    quantity: float = Field(gt=0)
    transaction_date: date
    notes: str | None = Field(default=None, max_length=1000)


class MilestoneCreate(BaseModel):
    project_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    planned_start_date: date
    due_date: date
    status: Literal[
        "Not Started",
        "In Progress",
        "Completed",
        "On Hold",
    ] = "Not Started"


class MilestoneUpdate(MilestoneCreate):
    pass


class SiteReportCreate(BaseModel):
    project_id: int = Field(gt=0)
    report_date: date
    site_progress: float | None = Field(default=None, ge=0, le=100)
    work_completed: str = Field(min_length=1, max_length=5000)
    delays: str = Field(default="", max_length=3000)
    safety_observations: str = Field(default="", max_length=3000)
    materials_used: str = Field(default="", max_length=3000)
    general_notes: str = Field(default="", max_length=5000)

# -------------------- ACTION & ISSUE TRACKER MODELS --------------------

class IssueCreate(BaseModel):
    project_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=3000)

    category: Literal[
        "Schedule",
        "Safety",
        "Materials",
        "Quality",
        "Budget",
        "Workforce",
        "Other",
    ] = "Other"

    priority: Literal[
        "Low",
        "Medium",
        "High",
        "Critical",
    ] = "Medium"

    assigned_to: str | None = Field(default=None, max_length=150)
    due_date: date | None = None

    status: Literal[
        "Open",
        "In Progress",
        "Resolved",
    ] = "Open"


class IssueUpdate(IssueCreate):
    pass



# -------------------- DATABASE --------------------

@contextmanager
def get_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")

    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                location TEXT NOT NULL,
                project_type TEXT NOT NULL,
                progress REAL NOT NULL,
                budget REAL NOT NULL,
                actual_expenditure REAL NOT NULL
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS workers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                daily_wage REAL NOT NULL CHECK (daily_wage >= 0),
                phone TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id)
                    REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_id INTEGER NOT NULL,
                attendance_date TEXT NOT NULL,
                hours_worked REAL NOT NULL
                    CHECK (hours_worked >= 0 AND hours_worked <= 24),
                status TEXT NOT NULL
                    CHECK (status IN (
                        'Present', 'Absent', 'Half-day', 'Leave'
                    )),
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (worker_id, attendance_date),
                FOREIGN KEY (worker_id)
                    REFERENCES workers(id) ON DELETE CASCADE
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS materials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                unit TEXT NOT NULL,
                opening_stock REAL NOT NULL CHECK (opening_stock >= 0),
                minimum_stock REAL NOT NULL CHECK (minimum_stock >= 0),
                unit_price REAL NOT NULL CHECK (unit_price >= 0),
                supplier TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id)
                    REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS milestones (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                planned_start_date TEXT NOT NULL,
                due_date TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Not Started'
                    CHECK (
                        status IN (
                            'Not Started',
                            'In Progress',
                            'Completed',
                            'On Hold'
                        )
                    ),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id)
                    REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )

        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS material_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                material_id INTEGER NOT NULL,
                transaction_type TEXT NOT NULL
                    CHECK (transaction_type IN ('Received', 'Used')),
                quantity REAL NOT NULL CHECK (quantity > 0),
                transaction_date TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (material_id)
                    REFERENCES materials(id) ON DELETE CASCADE
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS site_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                report_date TEXT NOT NULL,
                site_progress REAL
                    CHECK (
                        site_progress IS NULL
                        OR (site_progress >= 0 AND site_progress <= 100)
                    ),
                work_completed TEXT NOT NULL,
                delays TEXT NOT NULL DEFAULT '',
                safety_observations TEXT NOT NULL DEFAULT '',
                materials_used TEXT NOT NULL DEFAULT '',
                general_notes TEXT NOT NULL DEFAULT '',
                analysis_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id)
                    REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )
        # Daily site reports and their saved rule-based analysis.
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS issues (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'Other',
                priority TEXT NOT NULL DEFAULT 'Medium',
                assigned_to TEXT,
                due_date TEXT,
                status TEXT NOT NULL DEFAULT 'Open',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id)
                    REFERENCES projects(id) ON DELETE CASCADE
            )
            """
        )

        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_issues_project_status
            ON issues(project_id, status)
            """
        )

        existing_project = connection.execute(
            "SELECT id FROM projects WHERE id = ?",
            (1,),
        ).fetchone()

        if existing_project is None:
            connection.execute(
                """
                INSERT INTO projects (
                    id, name, location, project_type,
                    progress, budget, actual_expenditure
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    1,
                    "North District Community Centre",
                    "Kozhikode, Kerala",
                    "Building construction",
                    64,
                    5000000,
                    3120000,
                ),
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="SitePilot AI API",
    description="Construction project operations and intelligence API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Content-Type",
        "Authorization",
        "X-CSRF-Token",
    ],
)


@app.middleware("http")
async def protect_api(request: Request, call_next):
    path = request.url.path
    method = request.method.upper()

    # Authentication routes handle their own session checks.
    if path.startswith("/api/auth/"):
        return await call_next(request)

    # Public health endpoints and non-API routes remain accessible.
    if not path.startswith("/api/"):
        return await call_next(request)

    # Require a valid administrator session for every other API route.
    username = get_session_username(request)
    if username is None:
        from fastapi.responses import JSONResponse

        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
        )

    # Check the browser origin and CSRF token on state-changing requests.
    if method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")

        if origin != "http://localhost:5173":
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=403,
                content={"detail": "Invalid request origin"},
            )

        try:
            require_csrf(request)
        except HTTPException as exc:
            from fastapi.responses import JSONResponse

            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail},
            )

    return await call_next(request)


app.include_router(auth_router)

# -------------------- GENERAL --------------------

@app.get("/")
def home():
    return {"message": "Welcome to SitePilot AI"}


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "SitePilot AI",
        "version": "1.0.0",
    }


# -------------------- PROJECTS --------------------

@app.get("/api/projects")
def get_projects():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, location, project_type,
                   progress, budget, actual_expenditure
            FROM projects
            ORDER BY id
            """
        ).fetchall()

    return [dict(row) for row in rows]


@app.get("/api/projects/report/pdf")
def download_projects_pdf():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT id, name, location, project_type,
                   progress, budget, actual_expenditure
            FROM projects
            ORDER BY id
            """
        ).fetchall()

    projects = [dict(row) for row in rows]

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
    )

    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ReportTitle",
            parent=styles["Title"],
            alignment=TA_CENTER,
            textColor=colors.HexColor("#17365D"),
            spaceAfter=8,
        )
    )

    story = [
        Paragraph("SitePilot AI", styles["ReportTitle"]),
        Paragraph("Construction Project Summary Report", styles["Heading2"]),
        Spacer(1, 6 * mm),
        Paragraph(
            f"Generated on: {date.today().strftime('%d %B %Y')}",
            styles["Normal"],
        ),
        Spacer(1, 5 * mm),
    ]

    total_budget = sum(float(p["budget"]) for p in projects)
    total_expenditure = sum(
        float(p["actual_expenditure"]) for p in projects
    )
    average_progress = (
        sum(float(p["progress"]) for p in projects) / len(projects)
        if projects else 0
    )

    summary_data = [
        ["Portfolio Summary", "Value"],
        ["Number of projects", str(len(projects))],
        ["Total budget", f"INR {total_budget:,.2f}"],
        ["Total expenditure", f"INR {total_expenditure:,.2f}"],
        ["Remaining budget", f"INR {total_budget - total_expenditure:,.2f}"],
        ["Average project progress", f"{average_progress:.1f}%"],
    ]

    summary_table = Table(summary_data, colWidths=[75 * mm, 75 * mm])
    summary_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17365D")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D5DDE5")),
            ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F5F8FC")),
            ("PADDING", (0, 0), (-1, -1), 7),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ])
    )

    story.extend([
        summary_table,
        Spacer(1, 8 * mm),
        Paragraph("Project Details", styles["Heading2"]),
        Spacer(1, 3 * mm),
    ])

    project_data = [[
        "ID", "Project", "Location", "Type",
        "Progress", "Budget (INR)", "Spent (INR)", "Remaining (INR)",
    ]]

    for project in projects:
        budget = float(project["budget"])
        expenditure = float(project["actual_expenditure"])

        project_data.append([
            str(project["id"]),
            str(project["name"]),
            str(project["location"]),
            str(project["project_type"]),
            f'{float(project["progress"]):.1f}%',
            f"{budget:,.0f}",
            f"{expenditure:,.0f}",
            f"{budget - expenditure:,.0f}",
        ])

    details_table = Table(
        project_data,
        repeatRows=1,
        colWidths=[9 * mm, 32 * mm, 27 * mm, 25 * mm,
                   16 * mm, 23 * mm, 23 * mm, 25 * mm],
    )
    details_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#245B8F")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D5DDE5")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [colors.white, colors.HexColor("#F2F6FA")]),
            ("PADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ])
    )

    story.append(details_table)

    if not projects:
        story.extend([
            Spacer(1, 4 * mm),
            Paragraph("No projects are currently available.", styles["Normal"]),
        ])

    document.build(story)
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="sitepilot-project-report.pdf"'
        },
    )


@app.get("/api/projects/{project_id}")
def get_project(project_id: int):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id, name, location, project_type,
                   progress, budget, actual_expenditure
            FROM projects
            WHERE id = ?
            """,
            (project_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")

    return dict(row)


@app.post("/api/projects", status_code=201)
def create_project(project: ProjectCreate):
    data = project.model_dump()
    data["name"] = data["name"].strip()
    data["location"] = data["location"].strip()
    data["project_type"] = data["project_type"].strip()

    if not data["name"] or not data["location"] or not data["project_type"]:
        raise HTTPException(
            status_code=422,
            detail="Text fields cannot be blank",
        )

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO projects (
                name, location, project_type,
                progress, budget, actual_expenditure
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                data["name"],
                data["location"],
                data["project_type"],
                data["progress"],
                data["budget"],
                data["actual_expenditure"],
            ),
        )

        row = connection.execute(
            """
            SELECT id, name, location, project_type,
                   progress, budget, actual_expenditure
            FROM projects WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return dict(row)


@app.put("/api/projects/{project_id}")
def update_project(project_id: int, project: ProjectUpdate):
    data = project.model_dump()
    data["name"] = data["name"].strip()
    data["location"] = data["location"].strip()
    data["project_type"] = data["project_type"].strip()

    if not data["name"] or not data["location"] or not data["project_type"]:
        raise HTTPException(
            status_code=422,
            detail="Text fields cannot be blank",
        )

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM projects WHERE id = ?",
            (project_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(status_code=404, detail="Project not found")

        connection.execute(
            """
            UPDATE projects
            SET name = ?, location = ?, project_type = ?,
                progress = ?, budget = ?, actual_expenditure = ?
            WHERE id = ?
            """,
            (
                data["name"],
                data["location"],
                data["project_type"],
                data["progress"],
                data["budget"],
                data["actual_expenditure"],
                project_id,
            ),
        )

        row = connection.execute(
            """
            SELECT id, name, location, project_type,
                   progress, budget, actual_expenditure
            FROM projects WHERE id = ?
            """,
            (project_id,),
        ).fetchone()

    return dict(row)


# -------------------- WORKERS --------------------

@app.get("/api/workers")
def get_workers(project_id: int | None = Query(default=None, gt=0)):
    with get_connection() as connection:
        if project_id is None:
            rows = connection.execute(
                """
                SELECT w.*, p.name AS project_name
                FROM workers w
                JOIN projects p ON p.id = w.project_id
                ORDER BY w.id DESC
                """
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT w.*, p.name AS project_name
                FROM workers w
                JOIN projects p ON p.id = w.project_id
                WHERE w.project_id = ?
                ORDER BY w.id DESC
                """,
                (project_id,),
            ).fetchall()

    return [dict(row) for row in rows]


@app.post("/api/workers", status_code=201)
def create_worker(worker: WorkerCreate):
    data = worker.model_dump()
    data["name"] = data["name"].strip()
    data["role"] = data["role"].strip()
    data["phone"] = data["phone"].strip() if data["phone"] else None

    if not data["name"] or not data["role"]:
        raise HTTPException(
            status_code=422,
            detail="Name and role cannot be blank",
        )

    with get_connection() as connection:
        project = connection.execute(
            "SELECT id FROM projects WHERE id = ?",
            (data["project_id"],),
        ).fetchone()

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        cursor = connection.execute(
            """
            INSERT INTO workers (project_id, name, role, daily_wage, phone)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                data["project_id"],
                data["name"],
                data["role"],
                data["daily_wage"],
                data["phone"],
            ),
        )

        row = connection.execute(
            """
            SELECT w.*, p.name AS project_name
            FROM workers w
            JOIN projects p ON p.id = w.project_id
            WHERE w.id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return dict(row)


@app.put("/api/workers/{worker_id}")
def update_worker(worker_id: int, worker: WorkerUpdate):
    data = worker.model_dump()
    data["name"] = data["name"].strip()
    data["role"] = data["role"].strip()
    data["phone"] = data["phone"].strip() if data["phone"] else None

    if not data["name"] or not data["role"]:
        raise HTTPException(
            status_code=422,
            detail="Name and role cannot be blank",
        )

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM workers WHERE id = ?",
            (worker_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(status_code=404, detail="Worker not found")

        project = connection.execute(
            "SELECT id FROM projects WHERE id = ?",
            (data["project_id"],),
        ).fetchone()

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        connection.execute(
            """
            UPDATE workers
            SET project_id = ?, name = ?, role = ?, daily_wage = ?, phone = ?
            WHERE id = ?
            """,
            (
                data["project_id"],
                data["name"],
                data["role"],
                data["daily_wage"],
                data["phone"],
                worker_id,
            ),
        )

        row = connection.execute(
            """
            SELECT w.*, p.name AS project_name
            FROM workers w
            JOIN projects p ON p.id = w.project_id
            WHERE w.id = ?
            """,
            (worker_id,),
        ).fetchone()

    return dict(row)


# -------------------- ATTENDANCE --------------------

@app.get("/api/attendance")
def get_attendance(
    project_id: int | None = Query(default=None, gt=0),
    start_date: date | None = None,
    end_date: date | None = None,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date must be on or before end_date",
        )

    query = """
        SELECT a.id, a.worker_id, w.name AS worker_name,
               w.role, w.daily_wage, w.project_id,
               p.name AS project_name, a.attendance_date,
               a.hours_worked, a.status, a.notes,
               ROUND(w.daily_wage * a.hours_worked / 8.0, 2)
                   AS labour_cost
        FROM attendance a
        JOIN workers w ON w.id = a.worker_id
        JOIN projects p ON p.id = w.project_id
        WHERE 1 = 1
    """
    params: list = []

    if project_id is not None:
        query += " AND w.project_id = ?"
        params.append(project_id)

    if start_date is not None:
        query += " AND a.attendance_date >= ?"
        params.append(start_date.isoformat())

    if end_date is not None:
        query += " AND a.attendance_date <= ?"
        params.append(end_date.isoformat())

    query += " ORDER BY a.attendance_date DESC, w.name"

    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()

    return [dict(row) for row in rows]


def validate_attendance_record(data):
    if data["status"] in ("Absent", "Leave") and data["hours_worked"] != 0:
        raise HTTPException(
            status_code=422,
            detail="Absent and Leave records must have zero hours",
        )

    if data["status"] == "Half-day" and data["hours_worked"] > 4:
        raise HTTPException(
            status_code=422,
            detail="Half-day attendance cannot exceed four hours",
        )

    if data["status"] == "Present" and data["hours_worked"] == 0:
        raise HTTPException(
            status_code=422,
            detail="Present attendance must have hours greater than zero",
        )


@app.post("/api/attendance", status_code=201)
def create_attendance(record: AttendanceCreate):
    data = record.model_dump()
    notes = data["notes"].strip() if data["notes"] else None
    validate_attendance_record(data)

    with get_connection() as connection:
        worker = connection.execute(
            "SELECT id FROM workers WHERE id = ?",
            (data["worker_id"],),
        ).fetchone()

        if worker is None:
            raise HTTPException(status_code=404, detail="Worker not found")

        try:
            cursor = connection.execute(
                """
                INSERT INTO attendance (
                    worker_id, attendance_date,
                    hours_worked, status, notes
                )
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    data["worker_id"],
                    data["attendance_date"].isoformat(),
                    data["hours_worked"],
                    data["status"],
                    notes,
                ),
            )
        except sqlite3.IntegrityError as error:
            if "UNIQUE constraint failed" in str(error):
                raise HTTPException(
                    status_code=409,
                    detail="Attendance already exists for this worker and date",
                ) from error
            raise

        row = connection.execute(
            """
            SELECT a.id, a.worker_id, w.name AS worker_name,
                   w.project_id, a.attendance_date,
                   a.hours_worked, a.status, a.notes,
                   ROUND(w.daily_wage * a.hours_worked / 8.0, 2)
                       AS labour_cost
            FROM attendance a
            JOIN workers w ON w.id = a.worker_id
            WHERE a.id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return dict(row)


@app.get("/api/workforce/summary")
def get_workforce_summary(
    project_id: int | None = Query(default=None, gt=0),
    start_date: date | None = None,
    end_date: date | None = None,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date must be on or before end_date",
        )

    worker_query = "SELECT COUNT(*) FROM workers"
    worker_params: list = []

    if project_id is not None:
        worker_query += " WHERE project_id = ?"
        worker_params.append(project_id)

    attendance_query = """
        SELECT
            COUNT(a.id) AS attendance_records,
            COALESCE(SUM(a.hours_worked), 0) AS total_hours,
            COALESCE(SUM(w.daily_wage * a.hours_worked / 8.0), 0)
                AS labour_cost,
            COALESCE(SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END), 0)
                AS present_count,
            COALESCE(SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END), 0)
                AS absent_count,
            COALESCE(SUM(CASE WHEN a.status = 'Half-day' THEN 1 ELSE 0 END), 0)
                AS half_day_count,
            COALESCE(SUM(CASE WHEN a.status = 'Leave' THEN 1 ELSE 0 END), 0)
                AS leave_count
        FROM attendance a
        JOIN workers w ON w.id = a.worker_id
        WHERE 1 = 1
    """
    attendance_params: list = []

    if project_id is not None:
        attendance_query += " AND w.project_id = ?"
        attendance_params.append(project_id)

    if start_date is not None:
        attendance_query += " AND a.attendance_date >= ?"
        attendance_params.append(start_date.isoformat())

    if end_date is not None:
        attendance_query += " AND a.attendance_date <= ?"
        attendance_params.append(end_date.isoformat())

    with get_connection() as connection:
        worker_count = connection.execute(
            worker_query, worker_params
        ).fetchone()[0]

        summary = connection.execute(
            attendance_query, attendance_params
        ).fetchone()

    return {
        "worker_count": worker_count,
        "attendance_records": summary["attendance_records"],
        "total_hours": round(summary["total_hours"], 2),
        "labour_cost": round(summary["labour_cost"], 2),
        "present_count": summary["present_count"],
        "absent_count": summary["absent_count"],
        "half_day_count": summary["half_day_count"],
        "leave_count": summary["leave_count"],
    }


@app.put("/api/attendance/{attendance_id}")
def update_attendance(
    attendance_id: int,
    record: AttendanceCreate,
):
    data = record.model_dump()
    notes = data["notes"].strip() if data["notes"] else None
    validate_attendance_record(data)

    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM attendance WHERE id = ?",
            (attendance_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Attendance record not found",
            )

        worker = connection.execute(
            "SELECT id FROM workers WHERE id = ?",
            (data["worker_id"],),
        ).fetchone()

        if worker is None:
            raise HTTPException(status_code=404, detail="Worker not found")

        try:
            connection.execute(
                """
                UPDATE attendance
                SET worker_id = ?, attendance_date = ?,
                    hours_worked = ?, status = ?, notes = ?
                WHERE id = ?
                """,
                (
                    data["worker_id"],
                    data["attendance_date"].isoformat(),
                    data["hours_worked"],
                    data["status"],
                    notes,
                    attendance_id,
                ),
            )
        except sqlite3.IntegrityError as error:
            if "UNIQUE constraint failed" in str(error):
                raise HTTPException(
                    status_code=409,
                    detail="Attendance already exists for this worker and date",
                ) from error
            raise

        row = connection.execute(
            """
            SELECT a.id, a.worker_id, w.name AS worker_name,
                   w.role, w.daily_wage, w.project_id,
                   p.name AS project_name, a.attendance_date,
                   a.hours_worked, a.status, a.notes,
                   ROUND(w.daily_wage * a.hours_worked / 8.0, 2)
                       AS labour_cost
            FROM attendance a
            JOIN workers w ON w.id = a.worker_id
            JOIN projects p ON p.id = w.project_id
            WHERE a.id = ?
            """,
            (attendance_id,),
        ).fetchone()

    return dict(row)


# -------------------- MATERIALS & INVENTORY --------------------

MATERIAL_STOCK_QUERY = """
    SELECT
        m.id,
        m.project_id,
        p.name AS project_name,
        m.name,
        m.unit,
        m.opening_stock,
        m.minimum_stock,
        m.unit_price,
        m.supplier,
        ROUND(
            m.opening_stock + COALESCE(
                SUM(
                    CASE
                        WHEN mt.transaction_type = 'Received'
                            THEN mt.quantity
                        WHEN mt.transaction_type = 'Used'
                            THEN -mt.quantity
                        ELSE 0
                    END
                ),
                0
            ),
            3
        ) AS current_stock,
        ROUND(
            (
                m.opening_stock + COALESCE(
                    SUM(
                        CASE
                            WHEN mt.transaction_type = 'Received'
                                THEN mt.quantity
                            WHEN mt.transaction_type = 'Used'
                                THEN -mt.quantity
                            ELSE 0
                        END
                    ),
                    0
                )
            ) * m.unit_price,
            2
        ) AS stock_value,
        CASE
            WHEN m.opening_stock + COALESCE(
                SUM(
                    CASE
                        WHEN mt.transaction_type = 'Received'
                            THEN mt.quantity
                        WHEN mt.transaction_type = 'Used'
                            THEN -mt.quantity
                        ELSE 0
                    END
                ),
                0
            ) <= m.minimum_stock
            THEN 1
            ELSE 0
        END AS low_stock
    FROM materials m
    JOIN projects p ON p.id = m.project_id
    LEFT JOIN material_transactions mt ON mt.material_id = m.id
"""


@app.get("/api/materials")
def get_materials(
    project_id: int | None = Query(default=None, gt=0),
):
    query = MATERIAL_STOCK_QUERY
    params: list = []

    if project_id is not None:
        query += " WHERE m.project_id = ?"
        params.append(project_id)

    query += " GROUP BY m.id ORDER BY m.name COLLATE NOCASE"

    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()

    return [dict(row) for row in rows]


@app.post("/api/materials", status_code=201)
def create_material(material: MaterialCreate):
    data = material.model_dump()
    data["name"] = data["name"].strip()
    data["unit"] = data["unit"].strip()
    data["supplier"] = data["supplier"].strip() if data["supplier"] else None

    if not data["name"] or not data["unit"]:
        raise HTTPException(
            status_code=422,
            detail="Material name and unit cannot be blank",
        )

    with get_connection() as connection:
        project = connection.execute(
            "SELECT id FROM projects WHERE id = ?",
            (data["project_id"],),
        ).fetchone()

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        cursor = connection.execute(
            """
            INSERT INTO materials (
                project_id, name, unit, opening_stock,
                minimum_stock, unit_price, supplier
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["project_id"],
                data["name"],
                data["unit"],
                data["opening_stock"],
                data["minimum_stock"],
                data["unit_price"],
                data["supplier"],
            ),
        )

        row = connection.execute(
            MATERIAL_STOCK_QUERY + " WHERE m.id = ? GROUP BY m.id",
            (cursor.lastrowid,),
        ).fetchone()

    return dict(row)


@app.get("/api/material-transactions")
def get_material_transactions(
    project_id: int | None = Query(default=None, gt=0),
    material_id: int | None = Query(default=None, gt=0),
    start_date: date | None = None,
    end_date: date | None = None,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date must be on or before end_date",
        )

    query = """
        SELECT
            mt.id, mt.material_id, m.name AS material_name,
            m.unit, m.project_id, p.name AS project_name,
            mt.transaction_type, mt.quantity, mt.transaction_date,
            mt.notes, ROUND(mt.quantity * m.unit_price, 2)
                AS transaction_value
        FROM material_transactions mt
        JOIN materials m ON m.id = mt.material_id
        JOIN projects p ON p.id = m.project_id
        WHERE 1 = 1
    """
    params: list = []

    if project_id is not None:
        query += " AND m.project_id = ?"
        params.append(project_id)

    if material_id is not None:
        query += " AND mt.material_id = ?"
        params.append(material_id)

    if start_date is not None:
        query += " AND mt.transaction_date >= ?"
        params.append(start_date.isoformat())

    if end_date is not None:
        query += " AND mt.transaction_date <= ?"
        params.append(end_date.isoformat())

    query += " ORDER BY mt.transaction_date DESC, mt.id DESC"

    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()

    return [dict(row) for row in rows]


@app.post("/api/material-transactions", status_code=201)
def create_material_transaction(transaction: MaterialTransactionCreate):
    data = transaction.model_dump()
    notes = data["notes"].strip() if data["notes"] else None

    with get_connection() as connection:
        material = connection.execute(
            """
            SELECT m.id, m.unit_price,
                   m.opening_stock + COALESCE(
                       SUM(
                           CASE
                               WHEN mt.transaction_type = 'Received'
                                   THEN mt.quantity
                               WHEN mt.transaction_type = 'Used'
                                   THEN -mt.quantity
                               ELSE 0
                           END
                       ),
                       0
                   ) AS current_stock
            FROM materials m
            LEFT JOIN material_transactions mt ON mt.material_id = m.id
            WHERE m.id = ?
            GROUP BY m.id
            """,
            (data["material_id"],),
        ).fetchone()

        if material is None:
            raise HTTPException(status_code=404, detail="Material not found")

        if (
            data["transaction_type"] == "Used"
            and data["quantity"] > material["current_stock"]
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Insufficient stock. Available quantity: "
                    f"{material['current_stock']}."
                ),
            )

        cursor = connection.execute(
            """
            INSERT INTO material_transactions (
                material_id, transaction_type, quantity,
                transaction_date, notes
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                data["material_id"],
                data["transaction_type"],
                data["quantity"],
                data["transaction_date"].isoformat(),
                notes,
            ),
        )

        row = connection.execute(
            """
            SELECT mt.id, mt.material_id, m.name AS material_name,
                   m.unit, m.project_id, mt.transaction_type,
                   mt.quantity, mt.transaction_date, mt.notes,
                   ROUND(mt.quantity * m.unit_price, 2) AS transaction_value
            FROM material_transactions mt
            JOIN materials m ON m.id = mt.material_id
            WHERE mt.id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return dict(row)


# -------------------- TIMELINE & MILESTONES --------------------

@app.get("/api/milestones")
def get_milestones(
    project_id: int | None = Query(default=None, gt=0),
):
    query = """
        SELECT m.id, m.project_id, p.name AS project_name,
               m.title, m.description, m.planned_start_date,
               m.due_date, m.status,
               CASE
                   WHEN m.status != 'Completed'
                        AND m.due_date < date('now')
                   THEN 1
                   ELSE 0
               END AS is_overdue
        FROM milestones m
        JOIN projects p ON p.id = m.project_id
    """
    params: list = []

    if project_id is not None:
        query += " WHERE m.project_id = ?"
        params.append(project_id)

    query += " ORDER BY m.due_date, m.id"

    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()

    return [dict(row) for row in rows]


@app.post("/api/milestones", status_code=201)
def create_milestone(milestone: MilestoneCreate):
    data = milestone.model_dump()
    data["title"] = data["title"].strip()
    data["description"] = (
        data["description"].strip() if data["description"] else None
    )

    if not data["title"]:
        raise HTTPException(
            status_code=422,
            detail="Milestone title cannot be blank",
        )

    if data["planned_start_date"] > data["due_date"]:
        raise HTTPException(
            status_code=422,
            detail="Planned start date must be on or before the due date",
        )

    with get_connection() as connection:
        project = connection.execute(
            "SELECT id FROM projects WHERE id = ?",
            (data["project_id"],),
        ).fetchone()

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        cursor = connection.execute(
            """
            INSERT INTO milestones (
                project_id, title, description,
                planned_start_date, due_date, status
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                data["project_id"],
                data["title"],
                data["description"],
                data["planned_start_date"].isoformat(),
                data["due_date"].isoformat(),
                data["status"],
            ),
        )

        row = connection.execute(
            """
            SELECT id, project_id, title, description,
                   planned_start_date, due_date, status
            FROM milestones WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return dict(row)


@app.put("/api/milestones/{milestone_id}")
def update_milestone(
    milestone_id: int,
    milestone: MilestoneUpdate,
):
    data = milestone.model_dump()
    data["title"] = data["title"].strip()
    data["description"] = (
        data["description"].strip() if data["description"] else None
    )

    if not data["title"]:
        raise HTTPException(
            status_code=422,
            detail="Milestone title cannot be blank",
        )

    if data["planned_start_date"] > data["due_date"]:
        raise HTTPException(
            status_code=422,
            detail="Planned start date must be on or before the due date",
        )

    with get_connection() as connection:
        project = connection.execute(
            "SELECT id FROM projects WHERE id = ?",
            (data["project_id"],),
        ).fetchone()

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        existing = connection.execute(
            "SELECT id FROM milestones WHERE id = ?",
            (milestone_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(status_code=404, detail="Milestone not found")

        connection.execute(
            """
            UPDATE milestones
            SET project_id = ?, title = ?, description = ?,
                planned_start_date = ?, due_date = ?, status = ?
            WHERE id = ?
            """,
            (
                data["project_id"],
                data["title"],
                data["description"],
                data["planned_start_date"].isoformat(),
                data["due_date"].isoformat(),
                data["status"],
                milestone_id,
            ),
        )

        row = connection.execute(
            """
            SELECT id, project_id, title, description,
                   planned_start_date, due_date, status
            FROM milestones WHERE id = ?
            """,
            (milestone_id,),
        ).fetchone()

    return dict(row)


# -------------------- AI SITE-REPORT ANALYZER --------------------

def analyze_site_report(report: dict) -> dict:
    """
    Deterministic, rule-based analysis of the text entered in a site report.
    Findings are prompts for human review, not verified site conditions.
    """
    issues = []
    follow_up_actions = []

    delays_text = report["delays"].strip()
    safety_text = report["safety_observations"].strip()
    materials_text = report["materials_used"].strip()
    notes_text = report["general_notes"].strip()
    work_text = report["work_completed"].strip()

    if delays_text:
        issues.append({
            "severity": "Medium",
            "title": "Reported delay or obstruction",
            "details": delays_text,
            "recommended_action": (
                "Review the reported delay, assign an owner, "
                "and record a recovery plan."
            ),
        })
        follow_up_actions.append(
            "Review the reported delay and agree on a recovery plan."
        )

    if safety_text:
        safety_lower = safety_text.lower()
        high_risk_terms = (
            "injury",
            "injured",
            "accident",
            "unsafe",
            "fall hazard",
            "exposed wire",
            "electrical hazard",
            "no helmet",
            "no harness",
            "fire",
            "collapse",
        )
        medium_risk_terms = (
            "near miss",
            "missing ppe",
            "ppe missing",
            "hazard",
            "unsafe access",
            "scaffolding",
        )

        if any(term in safety_lower for term in high_risk_terms):
            severity = "High"
        elif any(term in safety_lower for term in medium_risk_terms):
            severity = "Medium"
        else:
            severity = "Low"

        issues.append({
            "severity": severity,
            "title": "Safety observation requires review",
            "details": safety_text,
            "recommended_action": (
                "Have the site supervisor assess the observation, "
                "apply appropriate controls, and document the outcome."
            ),
        })
        follow_up_actions.append(
            "Have the site supervisor review and document the safety observation."
        )

    if materials_text:
        material_lower = materials_text.lower()
        shortage_terms = (
            "shortage",
            "running low",
            "out of stock",
            "insufficient",
            "not available",
            "delayed delivery",
        )

        if any(term in material_lower for term in shortage_terms):
            issues.append({
                "severity": "Medium",
                "title": "Possible material supply issue",
                "details": materials_text,
                "recommended_action": (
                    "Verify current inventory, confirm delivery dates, "
                    "and plan procurement if required."
                ),
            })
            follow_up_actions.append(
                "Verify stock levels and confirm material delivery requirements."
            )

    combined_notes = f"{notes_text} {work_text}".lower()
    quality_terms = (
        "crack",
        "defect",
        "rework",
        "failed inspection",
        "poor quality",
        "damage",
    )

    if any(term in combined_notes for term in quality_terms):
        issues.append({
            "severity": "Medium",
            "title": "Possible quality issue",
            "details": (
                "The report mentions a quality-related term. "
                "Confirm the affected work and inspection status."
            ),
            "recommended_action": (
                "Arrange an appropriate inspection and record corrective action."
            ),
        })
        follow_up_actions.append(
            "Verify the reported quality concern and record inspection results."
        )

    progress = report["site_progress"]
    if progress is not None:
        if progress >= 100:
            progress_note = (
                "Reported site progress is 100%. Confirm completion "
                "and required inspections before closing the project."
            )
        else:
            progress_note = f"Reported site progress: {progress:g}%."
    else:
        progress_note = "No site progress percentage was supplied."

    if not issues:
        follow_up_actions.append(
            "Continue routine site monitoring and submit the next daily report."
        )

    summary_parts = [
        f"Daily site report for {report['report_date'].isoformat()}.",
        progress_note,
        f"Recorded issues requiring review: {len(issues)}.",
    ]

    if work_text:
        summary_parts.append(f"Work reported: {work_text}")

    return {
        "summary": " ".join(summary_parts),
        "issues": issues,
        "follow_up_actions": follow_up_actions,
    }


def serialize_site_report(row):
    result = dict(row)
    result["analysis"] = json.loads(result.pop("analysis_json"))
    return result


@app.post("/api/site-reports", status_code=201)
def create_site_report(report: SiteReportCreate):
    data = report.model_dump()

    # Normalize free-text fields.
    for field in (
        "work_completed",
        "delays",
        "safety_observations",
        "materials_used",
        "general_notes",
    ):
        data[field] = data[field].strip()

    if not data["work_completed"]:
        raise HTTPException(
            status_code=422,
            detail="Please describe the work completed",
        )

    with get_connection() as connection:
        project = connection.execute(
            "SELECT id, name FROM projects WHERE id = ?",
            (data["project_id"],),
        ).fetchone()

        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")

        analysis = analyze_site_report(data)
        analysis_json = json.dumps(analysis, ensure_ascii=False)

        cursor = connection.execute(
            """
            INSERT INTO site_reports (
                project_id, report_date, site_progress,
                work_completed, delays, safety_observations,
                materials_used, general_notes, analysis_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["project_id"],
                data["report_date"].isoformat(),
                data["site_progress"],
                data["work_completed"],
                data["delays"],
                data["safety_observations"],
                data["materials_used"],
                data["general_notes"],
                analysis_json,
            ),
        )

        row = connection.execute(
            """
            SELECT sr.*, p.name AS project_name
            FROM site_reports sr
            JOIN projects p ON p.id = sr.project_id
            WHERE sr.id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    return serialize_site_report(row)


@app.get("/api/site-reports")
def get_site_reports(
    project_id: int | None = Query(default=None, gt=0),
    start_date: date | None = None,
    end_date: date | None = None,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=422,
            detail="start_date must be on or before end_date",
        )

    query = """
        SELECT sr.*, p.name AS project_name
        FROM site_reports sr
        JOIN projects p ON p.id = sr.project_id
        WHERE 1 = 1
    """
    params: list = []

    if project_id is not None:
        query += " AND sr.project_id = ?"
        params.append(project_id)

    if start_date is not None:
        query += " AND sr.report_date >= ?"
        params.append(start_date.isoformat())

    if end_date is not None:
        query += " AND sr.report_date <= ?"
        params.append(end_date.isoformat())

    query += " ORDER BY sr.report_date DESC, sr.id DESC"

    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()

    return [serialize_site_report(row) for row in rows]


@app.get("/api/site-reports/{report_id}")
def get_site_report(report_id: int):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT sr.*, p.name AS project_name
            FROM site_reports sr
            JOIN projects p ON p.id = sr.project_id
            WHERE sr.id = ?
            """,
            (report_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Site report not found")

    return serialize_site_report(row)


# -------------------- ACTION & ISSUE TRACKER API --------------------

def serialize_issue(row):
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "project_name": row["project_name"],
        "title": row["title"],
        "description": row["description"],
        "category": row["category"],
        "priority": row["priority"],
        "assigned_to": row["assigned_to"],
        "due_date": row["due_date"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@app.get("/api/issues")
def get_issues(
    project_id: int | None = Query(default=None, gt=0),
    status: Literal["Open", "In Progress", "Resolved"] | None = None,
    priority: Literal["Low", "Medium", "High", "Critical"] | None = None,
):
    query = """
        SELECT i.*, p.name AS project_name
        FROM issues i
        JOIN projects p ON p.id = i.project_id
        WHERE 1 = 1
    """
    params: list = []

    if project_id is not None:
        query += " AND i.project_id = ?"
        params.append(project_id)

    if status is not None:
        query += " AND i.status = ?"
        params.append(status)

    if priority is not None:
        query += " AND i.priority = ?"
        params.append(priority)

    query += """
        ORDER BY
            CASE i.priority
                WHEN 'Critical' THEN 1
                WHEN 'High' THEN 2
                WHEN 'Medium' THEN 3
                WHEN 'Low' THEN 4
                ELSE 5
            END,
            i.due_date IS NULL,
            i.due_date ASC,
            i.id DESC
    """

    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()

    return [serialize_issue(row) for row in rows]


@app.get("/api/issues/{issue_id}")
def get_issue(issue_id: int):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT i.*, p.name AS project_name
            FROM issues i
            JOIN projects p ON p.id = i.project_id
            WHERE i.id = ?
            """,
            (issue_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    return serialize_issue(row)


@app.post("/api/issues", status_code=201)
def create_issue(issue: IssueCreate):
    with get_connection() as connection:
        project = connection.execute(
            "SELECT id FROM projects WHERE id = ?",
            (issue.project_id,),
        ).fetchone()

        if project is None:
            raise HTTPException(
                status_code=404,
                detail="Project not found",
            )

        cursor = connection.execute(
            """
            INSERT INTO issues (
                project_id, title, description, category,
                priority, assigned_to, due_date, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                issue.project_id,
                issue.title.strip(),
                issue.description,
                issue.category,
                issue.priority,
                issue.assigned_to,
                issue.due_date.isoformat() if issue.due_date else None,
                issue.status,
            ),
        )

        issue_id = cursor.lastrowid

        row = connection.execute(
            """
            SELECT i.*, p.name AS project_name
            FROM issues i
            JOIN projects p ON p.id = i.project_id
            WHERE i.id = ?
            """,
            (issue_id,),
        ).fetchone()

    return serialize_issue(row)


@app.put("/api/issues/{issue_id}")
def update_issue(issue_id: int, issue: IssueUpdate):
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM issues WHERE id = ?",
            (issue_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Issue not found",
            )

        project = connection.execute(
            "SELECT id FROM projects WHERE id = ?",
            (issue.project_id,),
        ).fetchone()

        if project is None:
            raise HTTPException(
                status_code=404,
                detail="Project not found",
            )

        connection.execute(
            """
            UPDATE issues
            SET project_id = ?,
                title = ?,
                description = ?,
                category = ?,
                priority = ?,
                assigned_to = ?,
                due_date = ?,
                status = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                issue.project_id,
                issue.title.strip(),
                issue.description,
                issue.category,
                issue.priority,
                issue.assigned_to,
                issue.due_date.isoformat() if issue.due_date else None,
                issue.status,
                issue_id,
            ),
        )

        row = connection.execute(
            """
            SELECT i.*, p.name AS project_name
            FROM issues i
            JOIN projects p ON p.id = i.project_id
            WHERE i.id = ?
            """,
            (issue_id,),
        ).fetchone()

    return serialize_issue(row)


@app.patch("/api/issues/{issue_id}/resolve")
def resolve_issue(issue_id: int):
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM issues WHERE id = ?",
            (issue_id,),
        ).fetchone()

        if existing is None:
            raise HTTPException(
                status_code=404,
                detail="Issue not found",
            )

        connection.execute(
            """
            UPDATE issues
            SET status = 'Resolved',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (issue_id,),
        )

        row = connection.execute(
            """
            SELECT i.*, p.name AS project_name
            FROM issues i
            JOIN projects p ON p.id = i.project_id
            WHERE i.id = ?
            """,
            (issue_id,),
        ).fetchone()

    return serialize_issue(row)


@app.delete("/api/issues/{issue_id}", status_code=204)
def delete_issue(issue_id: int):
    with get_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM issues WHERE id = ?",
            (issue_id,),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Issue not found",
            )

    return None