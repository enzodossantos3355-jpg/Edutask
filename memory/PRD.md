# Edutask - Product Requirements

## Original Problem Statement (PT-BR)
"Faça um app de gerenciar tarefas de casa da escola que tenha um perfil admin que tem total controle do app e criar outros perfils, mas somente o admin pode mandar tarefas"

## User Personas
- **Administrador (1)**: Cria/remove alunos, define status (ativo/manutenção/bloqueado), gerencia matérias, cria/edita/exclui tarefas com anexos, vê senhas dos alunos e progresso de cada tarefa.
- **Aluno (N)**: Vê tarefas atribuídas, marca como concluídas, baixa anexos, filtra por matéria/status.

## Architecture
- **Backend**: FastAPI (Python) + MongoDB (motor) + bcrypt + PyJWT
- **Frontend**: React 19 + React Router + Tailwind + Sonner + lucide-react
- **Auth**: JWT em Bearer header (também aceita httpOnly cookie). Login via `user_id` (profile picker) ou `email` (legado)
- **Storage**: Emergent Object Storage para anexos
- **Deploy**: Supervisor (backend:8001, frontend:3000), Kubernetes ingress

## Implemented (2026-04-25)
### Iteração 1 — MVP
- Tela de login estilo "Quem está usando?" com profile picker
- Admin seedado automaticamente (admin@escola.com / enzo123cg)
- CRUD de alunos (admin only, só nome + senha — sem email)
- CRUD de tarefas com matéria, descrição, data de entrega, anexos
- Marcar/desmarcar tarefa como concluída (aluno)
- Visualização de progresso (admin)
- Upload/download de anexos via Emergent Object Storage
- Design neo-brutalista (Outfit + DM Sans, paleta pastel + bordas pretas)
- Backend: 17/18 testes ✅

### Iteração 2 — Funcionalidades extras
- Logo customizado **Edutask** (SVG inline) com "Edu" em branco e "task" em azul
- **Status do perfil**: ativo / em manutenção / bloqueado
  - Profile picker mostra ícone (🛠️ chave / 🔒 cadeado) + dim no avatar
  - Login bloqueado para perfis não ativos (HTTP 403 com mensagem PT-BR)
  - Admin altera via dropdown no card do aluno
- **Matérias pré-definidas** (CRUD pelo admin)
  - 8 matérias seedadas: Matemática, Português, Ciências, História, Geografia, Inglês, Artes, Educação Física
  - Aba "Matérias" no painel admin
  - Criação de tarefa: dropdown ao invés de campo livre
- **Prioridade automática por data**:
  - 🔴 Urgente (atrasada/hoje), 🟠 Alta (1-2 dias), 🟡 Média (3-7 dias), 🟢 Baixa (>7 dias)
  - Badge visível em cards de admin e aluno
- **Senhas visíveis ao admin** (eye toggle no card do aluno)
- Backend: 27/27 testes ✅

## Backlog (P1)
- Notificações push/email para tarefas urgentes
- Edição de tarefas (botão "Editar" — endpoint PUT já existe)
- Filtros adicionais no admin (por matéria/data/aluno)
- Dashboard de estatísticas (engajamento por aluno)

## Backlog (P2)
- Comentários do aluno na tarefa
- Anexos do aluno como entrega (response files)
- Dark mode
- Multi-tenant (várias escolas/turmas)
- Brute-force lockout no login (já documentado pelo testing agent)

## Test Credentials
Ver `/app/memory/test_credentials.md`
