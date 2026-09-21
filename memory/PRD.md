# Edutask — School Homework Management App

## Roles
- **Admin**: Creates tasks, uploads photos of exercises, uses AI to generate answers, manages students, points, prize, firmware.
- **Aluno**: Views tasks, marks complete, sees AI-generated answers, uses free AI chat tutor.

## Core Features
- Netflix-style profile picker + password (no email for students)
- Task CRUD with recipients, attachments, due dates, auto-delete at 12:30 BRT
- Announcements with comments
- Gamification: points, streaks, 7 tiers (Bronze → Obsidian), confetti, monthly prize
- Admin: give/take points, view passwords, login logs (7d cleanup), stats
- Dark mode, mobile-responsive, floating clock
- Firmware/version admin panel + JSON export
- **AI features (Gemini 3 Flash + Vision)**:
  - Admin: "Escrever com IA" fills task description + announcement message
  - Admin: uploads **photos of the task (admin-only)** → AI generates the answer/gabarito
  - Admin: reviews/edits answer, saves; students see it via "Ver resposta" reveal
  - Student: daily AI summary banner + free "Tira-dúvida" chat tutor
  - Student: chat sessions persisted in `db.ai_chats`
- Make.com webhook: task.created + announcement.created events fired to `MAKE_WEBHOOK_URL`

## Tech Stack
- Backend: FastAPI + MongoDB (Motor) + JWT + APScheduler + emergentintegrations (LlmChat) + Gemini 3 Flash
- Frontend: React + Tailwind + Shadcn UI + canvas-confetti + lucide-react

## Key Files
- `/app/backend/server.py` (~1820 lines)
- `/app/frontend/src/pages/AdminDashboard.jsx` — admin panels
- `/app/frontend/src/pages/StudentDashboard.jsx` — student view (with AIDailySummary + reveal-answer)
- `/app/frontend/src/components/AIEnhanceButton.jsx` — reusable AI trigger button
- `/app/frontend/src/components/AIChatDialog.jsx` — chat drawer (free + task-context)
- `/app/frontend/src/components/AIDailySummary.jsx` — student daily banner
- `/app/frontend/src/components/FirmwarePanel.jsx`

## Key API Endpoints
- Auth: `/api/auth/login`, `/api/auth/profiles`, `/api/auth/me`
- Tasks: `/api/tasks` (CRUD, now with `admin_photos` + `answer`), `/api/tasks/{id}/complete`
- Announcements: `/api/announcements` + `/comments`
- Users, Subjects, Files (upload/download)
- Stats: `/api/me/stats`, `/api/admin/stats`, `/api/login-logs`, `/api/monthly-prize`
- Firmware: `/api/app-info` GET/PUT
- Integrations: `/api/integrations/webhook-logs`, `/webhook-test`
- **AI**: `/api/ai/improve-task`, `/generate-announcement`, `/check-answer`, `/explain-task`, `/chat`, `/chat/{sid}`, `/daily-summary`, `/generate-task-answer` (vision)

## Env Variables
- `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`
- `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
- `EMERGENT_LLM_KEY` (rotated as needed for storage + AI)
- `MAKE_WEBHOOK_URL` (Make.com automation)

## Backend Models
- `users`, `tasks` (+admin_photos, +answer), `announcements`, `comments`, `login_logs`, `point_adjustments`
- `settings` (singleton: monthly_prize, app_info, zapier legacy)
- `webhook_logs`, `ai_chats` (session_id, user_id, messages, task_id)

## Credentials
- Admin: `admin@escola.com` / `enzo123cg`
- Student: see `/app/memory/test_credentials.md`

## Backlog / Next
- P1: Student's task-context AI chat (currently only "Tira-dúvida" free mode)
- P1: Correção rápida — admin cola resposta do aluno + IA aponta erros (endpoint exists, needs UI)
- P1: Image on monthly prize (backend ready)
- P2: Real-time notifications (WebSocket or polling)
- P2: Split server.py into routers/models modules (>1800 lines)

## Recent Changes (2026-09 / iter 7)
- Gemini 3 Flash + Vision integrated via emergentintegrations
- New task fields: admin_photos (admin-only) + answer (visible to students)
- AI generates task answer from photos (admin flow)
- Student can reveal answer via button
- AI daily summary + free chat tutor
- AI text generation buttons for task description + announcement
- 14/14 backend + frontend AI tests passing
