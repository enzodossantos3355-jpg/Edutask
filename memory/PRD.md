# Edutask — School Homework Management App

## Original Problem Statement
Build a homework management app with an Admin role that has total control over the app (create/manage other profiles) and Students who can only view and complete tasks. Netflix-style profile selection (no email for students), gamification, admin controls, auto cleanup.

## Roles
- **Admin**: Total control — create/edit/delete students, create/edit/delete tasks and announcements, give/take points, see passwords, see login logs, manage monthly prize, manage app firmware/version.
- **Aluno (Student)**: View tasks assigned to them, mark as complete, view announcements, comment, see points/tier/streak.

## Core Features (implemented)
- Netflix-style profile picker + password login (no email for students)
- Task CRUD with specific recipients + attachments + due dates + auto-delete at 12:30 BRT
- Announcements with comments + recipients
- Avatar uploads (students + admin override)
- Gamification: points, streaks, 7 evolutionary tiers (Bronze → Obsidian), confetti
- Monthly prize system with leaderboard
- Admin: give/take points, block/maintenance status, view passwords, login logs (auto-cleanup 7d), stats dashboard
- Dark mode toggle
- Floating clock (hidden on login, repositioned on mobile)
- **Firmware section** (new Feb 2026): admin can view/edit app version, codename, release notes, and manage a feature list. Export as JSON download.

## Tech Stack
- Backend: FastAPI + MongoDB (Motor) + JWT auth + APScheduler background loops
- Frontend: React + Tailwind + Shadcn UI + canvas-confetti

## Key Files
- `/app/backend/server.py` — all endpoints and models (1313 lines)
- `/app/frontend/src/pages/AdminDashboard.jsx` — admin panels with tabs
- `/app/frontend/src/pages/StudentDashboard.jsx` — student view
- `/app/frontend/src/pages/LoginPage.jsx` — Netflix-style picker
- `/app/frontend/src/components/FirmwarePanel.jsx` — firmware/version admin section (NEW)
- `/app/frontend/src/components/AppHeader.jsx` — sticky header (mobile responsive)
- `/app/frontend/src/components/Clock.jsx` — floating clock, bottom-right on mobile
- `/app/frontend/src/components/MyProfileBanner.jsx` — profile info with StatsCard
- `/app/frontend/src/context/AuthContext.js` — JWT storage
- `/app/frontend/src/context/ThemeContext.js` — light/dark toggle

## Key API Endpoints
- `/api/auth/login`, `/api/auth/profiles`, `/api/auth/me`
- `/api/tasks` (CRUD + complete/uncomplete), `/api/announcements` (CRUD + comments)
- `/api/users` (CRUD), `/api/me`, `/api/me/stats`, `/api/me/avatar`
- `/api/subjects`, `/api/files/upload|download`
- `/api/login-logs`, `/api/admin/stats`, `/api/monthly-prize`
- `/api/app-info` (GET for all, PUT admin) — **NEW**

## Backend Models
- `users` (email, name, password_hash, role, status, has_avatar, points, streak, longest_streak, last_login_date)
- `tasks` (title, subject, due_date, assigned_to, attachments)
- `announcements`, `comments`, `login_logs`, `point_adjustments`
- `settings` (singleton docs: `monthly_prize`, `app_info`)

## Credentials
- Admin: `admin@escola.com` / `enzo123cg`
- Student: see `/app/memory/test_credentials.md`

## Backlog / Next
- P1: IA Assistant to suggest task titles/descriptions
- P1: Student upload of task answer (photo/PDF) for admin review
- P1: Real-time notifications (WebSocket or polling)
- P2: Split `server.py` into routers/models modules (>1300 lines)
- P2: Brute-force lockout on login
- P2: Push notifications (PWA)

## Recent Changes (2026-02 / iter 4)
- Added Firmware section (admin only) — version, codename, release notes, features editor
- Added JSON download of firmware info
- Mobile responsiveness polish across Login/Admin/Student dashboards
- Floating clock hidden on login, repositioned to bottom-right on mobile
- AppHeader sticky + compact on mobile
- Dialogs now `p-5 sm:p-7` to fit small screens
- 51/51 backend tests passing (incl. 12 new for `/api/app-info`)
