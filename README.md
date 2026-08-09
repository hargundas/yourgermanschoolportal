# 📘 YGS (Your German School) - Full Stack Enterprise System

Welcome to the complete production-ready code & architecture repository for **YGS (Your German School)**, featuring a Next.js 14 Frontend, Java Spring Boot 3.2 REST Service, MySQL 8.0 Database, and Docker orchestration.

---

## 🚀 Quick Start with Docker (One-Command Launch)

To spin up the database, backend services, and frontend portal automatically:

```bash
docker-compose up --build -d
```

Once running:
- **Public Website & Portals**: `http://localhost:3000`
- **Spring Boot REST API Base**: `http://localhost:8080/api/v1`
- **Swagger / OpenAPI Documentation**: `http://localhost:8080/swagger-ui.html`

---

## 🔑 Default Credentials & Seed Roles

| Role | Email | Password | Access Rights |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@ygs.com` | `admin123` | Full System CMS, Approvals, Batch Assignment, CRUD Teachers/Courses/Reviews |
| **Senior Teacher** | `hans.weber@ygs.com` | `admin123` | Mark Attendance, Homework Builder, Grade Homework, Student Comments |
| **Teacher** | `clara.schmidt@ygs.com` | `admin123` | Mark Attendance, Homework Builder, Grade Homework |

---

## 📑 Core REST API Endpoints Overview

### 1. Authentication & Security (`/api/v1/auth`)
- `POST /api/v1/auth/login` -> Bearer JWT Token response (`accessToken`, `roles`, `email`)
- `POST /api/v1/auth/register-student` -> Student registration with fee proof upload

### 2. Admin Management (`/api/v1/admin`)
- `GET /api/v1/admin/dashboard-stats` -> KPI Cards & Analytical trends
- `GET /api/v1/admin/students/pending` -> View applications awaiting approval
- `POST /api/v1/admin/students/{id}/approve` -> Approve student & assign Batch + Teacher + Schedule + Meet Link
- `POST /api/v1/admin/batches` -> Create new batch
- `PUT /api/v1/admin/cms/content` -> Update Mission, Vision, and Social Links without code

### 3. Student Portal (`/api/v1/student`)
- `GET /api/v1/student/dashboard` -> Student batch, teacher, schedule, meet link, attendance %
- `GET /api/v1/student/homework` -> View assigned homework
- `POST /api/v1/student/homework/{id}/submit` -> Submit homework text or PDF
- `GET /api/v1/student/attendance` -> View attendance logs (Present/Absent/Late)

### 4. Teacher Portal (`/api/v1/teacher`)
- `GET /api/v1/teacher/classes/today` -> View today's scheduled classes
- `POST /api/v1/teacher/attendance` -> Mark batch attendance
- `POST /api/v1/teacher/homework` -> Create homework with attachment & due date
- `POST /api/v1/teacher/students/{id}/comment` -> Leave performance comment for student

### 5. Practice Engine (`/api/v1/practice`)
- `GET /api/v1/practice/questions?level=A1` -> Fetch mixed German practice questions
- `POST /api/v1/practice/evaluate` -> Evaluate student quiz submission and return auto-calculated score
