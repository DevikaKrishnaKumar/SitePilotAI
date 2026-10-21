import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from itsdangerous import URLSafeTimedSerializer

# Make the backend folder importable when pytest runs from the project root.
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import auth
import main


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Give each test its own isolated database.
    test_database = tmp_path / "sitepilot_test.db"
    monkeypatch.setattr(main, "DATABASE_PATH", test_database)

    # Use dedicated test credentials; never change the real .env file.
    test_password = "SitePilot-Test-Password-123!"
    monkeypatch.setattr(auth, "ADMIN_USERNAME", "test-admin")
    monkeypatch.setattr(
        auth,
        "ADMIN_PASSWORD_HASH",
        auth.password_hasher.hash(test_password),
    )
    monkeypatch.setattr(
        auth,
        "serializer",
        URLSafeTimedSerializer(
            auth.SESSION_SECRET_KEY,
            salt="sitepilot-admin-session-v1",
        ),
    )

    with TestClient(main.app) as test_client:
        # Authenticate the test client using the same login route as the app.
        login_response = test_client.post(
            "/api/auth/login",
            json={
                "username": "test-admin",
                "password": test_password,
            },
            headers={"Origin": "http://localhost:5173"},
        )

        assert login_response.status_code == 200, login_response.text

        csrf_token = login_response.json()["csrf_token"]

        # Include the origin and CSRF token required by protected write routes.
        test_client.headers.update(
            {
                "Origin": "http://localhost:5173",
                "X-CSRF-Token": csrf_token,
            }
        )

        yield test_client
def create_project(client):
    """Create a project for tests that require a valid project ID."""
    response = client.post(
        "/api/projects",
        json={
            "name": "Automated Test Project",
            "location": "Kozhikode, Kerala",
            "project_type": "Building construction",
            "progress": 35,
            "budget": 1000000,
            "actual_expenditure": 300000,
        },
    )

    assert response.status_code == 201
    return response.json()


def create_worker(client, project_id):
    """Create a worker for attendance tests."""
    response = client.post(
        "/api/workers",
        json={
            "project_id": project_id,
            "name": "Test Worker",
            "role": "Mason",
            "daily_wage": 900,
            "phone": "9876543210",
        },
    )

    assert response.status_code == 201
    return response.json()


def create_material(client, project_id):
    """Create a material for inventory tests."""
    response = client.post(
        "/api/materials",
        json={
            "project_id": project_id,
            "name": "Cement",
            "unit": "bags",
            "opening_stock": 100,
            "minimum_stock": 20,
            "unit_price": 400,
            "supplier": "Test Supplier",
        },
    )

    assert response.status_code == 201
    return response.json()


# -------------------- BASIC API TESTS --------------------

def test_home_endpoint(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json()["message"] == "Welcome to SitePilot AI"


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_projects_endpoint_returns_list(client):
    response = client.get("/api/projects")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_create_and_retrieve_project(client):
    project = create_project(client)

    response = client.get(f"/api/projects/{project['id']}")

    assert response.status_code == 200
    assert response.json()["name"] == "Automated Test Project"
    assert response.json()["progress"] == 35


def test_project_rejects_progress_above_100(client):
    response = client.post(
        "/api/projects",
        json={
            "name": "Invalid Test Project",
            "location": "Kozhikode, Kerala",
            "project_type": "Building construction",
            "progress": 120,
            "budget": 1000000,
            "actual_expenditure": 100000,
        },
    )

    assert response.status_code == 422


def test_project_rejects_negative_budget(client):
    response = client.post(
        "/api/projects",
        json={
            "name": "Invalid Budget Project",
            "location": "Kozhikode, Kerala",
            "project_type": "Building construction",
            "progress": 20,
            "budget": -500,
            "actual_expenditure": 100,
        },
    )

    assert response.status_code == 422


def test_missing_project_returns_404(client):
    response = client.get("/api/projects/999999")

    assert response.status_code == 404


def test_pdf_report_download(client):
    response = client.get("/api/projects/report/pdf")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


# -------------------- WORKFORCE TESTS --------------------

def test_create_and_list_worker(client):
    project = create_project(client)
    worker = create_worker(client, project["id"])

    assert worker["name"] == "Test Worker"
    assert worker["project_id"] == project["id"]

    response = client.get("/api/workers")

    assert response.status_code == 200
    assert any(item["id"] == worker["id"] for item in response.json())


def test_workers_can_be_filtered_by_project(client):
    project_one = create_project(client)
    worker = create_worker(client, project_one["id"])

    project_two_response = client.post(
        "/api/projects",
        json={
            "name": "Second Test Project",
            "location": "Kannur, Kerala",
            "project_type": "Road construction",
            "progress": 10,
            "budget": 500000,
            "actual_expenditure": 50000,
        },
    )
    assert project_two_response.status_code == 201
    project_two = project_two_response.json()

    response = client.get(
        "/api/workers",
        params={"project_id": project_two["id"]},
    )

    assert response.status_code == 200
    assert all(
        item["project_id"] == project_two["id"]
        for item in response.json()
    )
    assert all(
        item["id"] != worker["id"]
        for item in response.json()
    )


def test_worker_rejects_nonexistent_project(client):
    response = client.post(
        "/api/workers",
        json={
            "project_id": 999999,
            "name": "Test Worker",
            "role": "Mason",
            "daily_wage": 900,
        },
    )

    assert response.status_code == 404


# -------------------- ATTENDANCE TESTS --------------------

def test_create_and_list_attendance(client):
    project = create_project(client)
    worker = create_worker(client, project["id"])

    response = client.post(
        "/api/attendance",
        json={
            "worker_id": worker["id"],
            "attendance_date": "2026-10-20",
            "hours_worked": 8,
            "status": "Present",
            "notes": "Test attendance entry",
        },
    )

    assert response.status_code == 201

    attendance = response.json()
    assert attendance["worker_id"] == worker["id"]
    assert attendance["status"] == "Present"

    list_response = client.get("/api/attendance")

    assert list_response.status_code == 200
    assert any(
        item["id"] == attendance["id"]
        for item in list_response.json()
    )


def test_attendance_rejects_hours_above_24(client):
    project = create_project(client)
    worker = create_worker(client, project["id"])

    response = client.post(
        "/api/attendance",
        json={
            "worker_id": worker["id"],
            "attendance_date": "2026-10-20",
            "hours_worked": 25,
            "status": "Present",
            "notes": "",
        },
    )

    assert response.status_code == 422


# -------------------- MATERIALS AND INVENTORY TESTS --------------------

def test_create_and_list_material(client):
    project = create_project(client)
    material = create_material(client, project["id"])

    assert material["name"] == "Cement"

    response = client.get("/api/materials")

    assert response.status_code == 200
    assert any(
        item["id"] == material["id"]
        for item in response.json()
    )


def test_material_rejects_nonexistent_project(client):
    response = client.post(
        "/api/materials",
        json={
            "project_id": 999999,
            "name": "Cement",
            "unit": "bags",
            "opening_stock": 100,
            "minimum_stock": 20,
            "unit_price": 400,
        },
    )

    assert response.status_code == 404


def test_received_material_increases_stock(client):
    project = create_project(client)
    material = create_material(client, project["id"])

    response = client.post(
        "/api/material-transactions",
        json={
            "material_id": material["id"],
            "transaction_type": "Received",
            "quantity": 25,
            "transaction_date": "2026-10-20",
            "notes": "Test delivery",
        },
    )

    assert response.status_code == 201

    stock_response = client.get(
        "/api/materials",
        params={"project_id": project["id"]},
    )

    assert stock_response.status_code == 200

    updated_material = next(
        item
        for item in stock_response.json()
        if item["id"] == material["id"]
    )

    assert updated_material["current_stock"] == 125


def test_used_material_decreases_stock(client):
    project = create_project(client)
    material = create_material(client, project["id"])

    response = client.post(
        "/api/material-transactions",
        json={
            "material_id": material["id"],
            "transaction_type": "Used",
            "quantity": 15,
            "transaction_date": "2026-10-20",
            "notes": "Test material usage",
        },
    )

    assert response.status_code == 201

    stock_response = client.get(
        "/api/materials",
        params={"project_id": project["id"]},
    )

    updated_material = next(
        item
        for item in stock_response.json()
        if item["id"] == material["id"]
    )

    assert updated_material["current_stock"] == 85


def test_material_transaction_rejects_invalid_date_range(client):
    response = client.get(
        "/api/material-transactions",
        params={
            "start_date": "2026-10-25",
            "end_date": "2026-10-20",
        },
    )

    assert response.status_code == 422


# -------------------- MILESTONE TESTS --------------------

def test_create_and_list_milestone(client):
    project = create_project(client)

    response = client.post(
        "/api/milestones",
        json={
            "project_id": project["id"],
            "title": "Foundation Completion",
            "description": "Complete the building foundation",
            "planned_start_date": "2026-10-20",
            "due_date": "2026-11-10",
            "status": "In Progress",
        },
    )

    assert response.status_code == 201
    milestone = response.json()

    assert milestone["title"] == "Foundation Completion"
    assert milestone["status"] == "In Progress"

    list_response = client.get(
        "/api/milestones",
        params={"project_id": project["id"]},
    )

    assert list_response.status_code == 200
    assert any(
        item["id"] == milestone["id"]
        for item in list_response.json()
    )


def test_milestone_rejects_start_after_due_date(client):
    project = create_project(client)

    response = client.post(
        "/api/milestones",
        json={
            "project_id": project["id"],
            "title": "Invalid Milestone",
            "description": "",
            "planned_start_date": "2026-11-15",
            "due_date": "2026-11-10",
            "status": "Not Started",
        },
    )

    assert response.status_code == 422


# -------------------- SITE REPORT TESTS --------------------

def test_create_and_retrieve_site_report(client):
    project = create_project(client)

    response = client.post(
        "/api/site-reports",
        json={
            "project_id": project["id"],
            "report_date": "2026-10-20",
            "site_progress": 40,
            "work_completed": "Completed foundation reinforcement",
            "delays": "",
            "safety_observations": "",
            "materials_used": "Cement and steel",
            "general_notes": "Automated test report",
        },
    )

    assert response.status_code == 201
    report = response.json()

    assert report["project_id"] == project["id"]
    assert report["work_completed"] == "Completed foundation reinforcement"
    assert "analysis" in report

    get_response = client.get(
        f"/api/site-reports/{report['id']}"
    )

    assert get_response.status_code == 200
    assert get_response.json()["id"] == report["id"]


def test_site_report_rejects_nonexistent_project(client):
    response = client.post(
        "/api/site-reports",
        json={
            "project_id": 999999,
            "report_date": "2026-10-20",
            "site_progress": 40,
            "work_completed": "Completed foundation reinforcement",
            "delays": "",
            "safety_observations": "",
            "materials_used": "",
            "general_notes": "",
        },
    )

    assert response.status_code == 404


# -------------------- ISSUE TRACKER TESTS --------------------

def test_create_and_list_issue(client):
    project = create_project(client)

    response = client.post(
        "/api/issues",
        json={
            "project_id": project["id"],
            "title": "Material delivery delay",
            "description": "Cement delivery has been delayed",
            "category": "Materials",
            "priority": "High",
            "assigned_to": "Site Manager",
            "due_date": "2026-11-01",
            "status": "Open",
        },
    )

    assert response.status_code == 201
    issue = response.json()

    assert issue["title"] == "Material delivery delay"
    assert issue["priority"] == "High"
    assert issue["status"] == "Open"

    list_response = client.get(
        "/api/issues",
        params={"project_id": project["id"]},
    )

    assert list_response.status_code == 200
    assert any(
        item["id"] == issue["id"]
        for item in list_response.json()
    )


def test_resolve_issue(client):
    project = create_project(client)

    create_response = client.post(
        "/api/issues",
        json={
            "project_id": project["id"],
            "title": "Test issue to resolve",
            "description": "Testing issue resolution",
            "category": "Quality",
            "priority": "Medium",
            "status": "Open",
        },
    )

    assert create_response.status_code == 201
    issue_id = create_response.json()["id"]

    response = client.patch(
        f"/api/issues/{issue_id}/resolve"
    )

    assert response.status_code == 200
    assert response.json()["status"] == "Resolved"


def test_delete_issue(client):
    project = create_project(client)

    create_response = client.post(
        "/api/issues",
        json={
            "project_id": project["id"],
            "title": "Test issue to delete",
            "description": "Testing deletion",
            "category": "Other",
            "priority": "Low",
            "status": "Open",
        },
    )

    assert create_response.status_code == 201
    issue_id = create_response.json()["id"]

    delete_response = client.delete(
        f"/api/issues/{issue_id}"
    )

    assert delete_response.status_code == 204

    get_response = client.get(f"/api/issues/{issue_id}")

    assert get_response.status_code == 404


def test_missing_issue_returns_404(client):
    response = client.get("/api/issues/999999")

    assert response.status_code == 404



def test_projects_endpoint_requires_authentication(client):
    client.cookies.clear()
    client.headers.pop("X-CSRF-Token", None)

    response = client.get("/api/projects")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required"


def test_login_rejects_invalid_password(client):
    response = client.post(
        "/api/auth/login",
        json={
            "username": "test-admin",
            "password": "DefinitelyWrongPassword-123!",
        },
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid username or password"


def test_write_endpoint_requires_csrf_token(client):
    client.headers.pop("X-CSRF-Token", None)

    response = client.post(
        "/api/issues",
        json={},
        headers={"Origin": "http://localhost:5173"},
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "CSRF validation failed"


def test_invalid_session_cookie_is_rejected(client):
    client.cookies.set("sitepilot_session", "invalid-session-token")

    response = client.get("/api/projects")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required"