# SitePilot AI 🏗️

**An AI-assisted construction project management platform**

SitePilot AI is a full-stack web application designed to bring essential construction operations into one platform. It helps organize project information, monitor progress and expenditure, manage workforce and materials, track milestones, and review site-related insights.

This project was developed to explore how modern web development and AI-assisted functionality can support construction project management.

## ✨ Features

### 📊 Project Overview
- Consolidated project dashboard and performance indicators
- Project progress, budget, and expenditure monitoring
- Executive-level analytics for an overview of operations

### 🏗️ Project Management
- Create, view, and update construction projects
- Maintain project details, locations, budgets, and progress
- Persistent data storage using SQLite

### 👷 Workforce Management
- Worker record management
- Attendance tracking

### 📦 Materials and Inventory
- Material record management
- Inventory-related transaction tracking

### 📅 Timeline and Financial Monitoring
- Project milestones and timeline tracking
- Budget and expenditure monitoring
- Downloadable project reports in CSV and PDF formats

### 🤖 AI-Assisted Functionality
- Site-report analysis and report history
- Rule-based project insights and decision support
- A foundation for further AI integration into construction workflows

### 📍 Additional Features
- Project issue tracking
- Project location visualization
- Authentication and session management
- Backend testing and database integrity checks

## 🛠️ Technology Stack

**Frontend**
- React
- TypeScript
- Vite
- CSS

**Backend**
- Python
- FastAPI
- Uvicorn

**Database**
- SQLite

**Testing and Quality**
- Pytest
- API testing
- Database integrity checks

## 🏛️ Architecture

The application uses a frontend–backend architecture:

1. **Frontend:** React and TypeScript provide the user interface.
2. **Backend:** FastAPI exposes API endpoints for application functionality.
3. **Database:** SQLite stores application records locally.
4. **AI-assisted features:** Site-report analysis and rule-based insights support the review of project information.

## 🚀 Getting Started

### Prerequisites

Install the following before running the application:

- Python 3.11 or a compatible version
- Node.js and npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/DevikaKrishnaKumar/SitePilotAI.git
cd SitePilotAI
```

### 2. Set up the Python environment

From the project root, create and activate a virtual environment.

**Windows PowerShell:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the backend dependencies:

```powershell
pip install -r requirements.txt
```

Configure the required local environment variables before starting the backend. Use the application's expected configuration and your own development credentials. Never publish your `.env` file or secret keys.

### 3. Start the backend

From the project root:

```powershell
cd backend
python -m uvicorn main:app --reload
```

The backend runs at:

`http://127.0.0.1:8000`

### 4. Set up the frontend

Open a second terminal and navigate to the frontend directory from the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite in your terminal, typically:

`http://localhost:5173`

### 5. Run backend tests

From the project root, activate the Python environment and run:

```powershell
python -m pytest backend\tests\test_api.py -q
```

### 6. Build the frontend

From the frontend directory:

```powershell
npm run build
```

## 🔐 Security Notes

- Authentication is implemented for the local application.
- Environment variables and secrets must be configured locally.
- Local database files and environment files should not be committed to Git.
- The current configuration is intended for local development, not direct public production deployment.

## 📌 Project Status

SitePilot AI is a working development prototype with project management, workforce and inventory features, reporting, site-report analysis, and rule-based decision support.

The backend tests and frontend production build have passed in the development environment. A public production deployment and its additional hosting and security configuration remain future work.

## 🔮 Future Improvements

- Public deployment with production-ready configuration
- Further refinement of AI-assisted analysis and decision support
- Additional validation, usability improvements, and testing
- Continued improvements to the React frontend

## 👩‍💻 Author

**Devika K.**

B.Tech in Artificial Intelligence Engineering

Interested in AI/ML, React, full-stack application development, and practical AI-powered solutions.

---

*SitePilot AI — Bringing construction project information together in one place.*
