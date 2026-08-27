# AcademiaAi

AI-Powered Study Assistant with OCR and Intelligent Web-Enhanced Knowledge Retrieval

> **Authors:** Crystal Juta (R251505Y) · Patiance Staicey Ndlovu (R251438X)  
> **Programme:** Computer Science

---

## Overview

AcademiaAi is an intelligent study assistant designed to improve how students interact with academic materials. The system uses **Optical Character Recognition (OCR)** to extract text from images and scanned documents, applies **artificial intelligence** via Google Gemini to analyse and understand the content, and incorporates **web-based knowledge retrieval** to obtain additional academic information from online sources when local materials are insufficient.

The core concept is a **notebook-based workspace**: each notebook contains **sources** (uploaded documents, web pages, or pasted text), a **chat interface** for asking questions grounded in those sources, and a **Studio panel** for generating study materials such as quizzes, flashcards, summaries, and reports.

---

## Features

- **Document Ingestion** — Upload images, PDFs, or paste text. OCR extracts content automatically.
- **Web Sources** — Add academic articles and web pages via URL for automatic text extraction.
- **Source-Grounded Chat** — Ask questions about your selected sources and receive streamed, citation-backed AI responses.
- **Web-Enhanced Answers** — When local sources are insufficient, the assistant retrieves and cites up-to-date information from the web.
- **Studio Generation** — Generate structured study materials from your sources:
  - Quizzes with configurable difficulty and question count
  - Flashcards for spaced repetition review
  - Summaries and reports with key concepts and definitions
  - Mind maps and data tables (planned)
- **Notes** — Take personal notes linked to specific sources or generated outputs.
- **Sharing** — Share notebooks with classmates via role-based access (owner, editor, viewer).
- **Progress Tracking** — Monitor study activity, quiz accuracy, and flashcard review streaks.

---

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 + Vite | UI framework and build tool |
| TypeScript | Type safety across the codebase |
| Tailwind CSS | Utility-first styling |
| shadcn/ui | Accessible, composable UI components |
| React Router | Client-side routing |
| TanStack Query | Server-state management, caching, and polling |
| Clerk | Authentication (sign-in, sign-up, session management) |
| Tesseract.js | Client-side OCR for quick text extraction |
| Zustand | Lightweight client-side state management |

### Backend
| Technology | Purpose |
|------------|---------|
| Node.js + Express | REST API server |
| TypeScript | Type safety |
| Prisma ORM | Database access and migrations |
| PostgreSQL | Relational database |
| Clerk Express SDK | Authentication middleware |
| Google Gemini API | AI chat, embeddings, and content generation |
| Zod | Runtime request/response validation |
| Multer | File upload handling |
| Sharp | Image preprocessing for OCR |
| Cheerio | Web page text extraction |
| SerpAPI | Web knowledge retrieval |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| Docker + Docker Compose | Local development environment |
| Local filesystem / MinIO | File storage (development) |
| S3-compatible storage | File storage (production) |
| npm workspaces | Monorepo management |

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ and npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (for PostgreSQL)
- [Clerk](https://clerk.dev) account (free tier)
- [Google AI Studio](https://aistudio.google.com) API key (free tier)
- [SerpAPI](https://serpapi.com) key (optional, for web search)

---

## Getting Started

### 1. Clone and install

```bash
git clone <your-repo-url>
cd academia-ai
npm install
```

### 2. Start PostgreSQL

```bash
docker-compose up -d
```

This starts a PostgreSQL container on port `5432` with the following credentials:
- **User:** `academiaai`
- **Password:** `academiaai_dev`
- **Database:** `academiaai`

### 3. Configure environment variables

Copy the example files and fill in your API keys:

```bash
cp apps/web/.env.example apps/web/.env
cp apps/api/.env.example apps/api/.env
```

**`apps/web/.env`**
```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

**`apps/api/.env`**
```env
DATABASE_URL="postgresql://academiaai:academiaai_dev@localhost:5432/academiaai"
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
GEMINI_API_KEY=...
SERP_API_KEY=...           # optional
PORT=5000
NODE_ENV=development
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

### 4. Initialize the database

```bash
npm run db:generate   # Generate Prisma Client
npm run db:migrate    # Run migrations
```

### 5. Start development servers

```bash
npm run dev
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:5000
- **Prisma Studio:** http://localhost:5555 (run `npm run db:studio`)

---

## Project Structure

```
academia-ai/
├── apps/
│   ├── web/                    # React frontend
│   │   ├── src/
│   │   │   ├── components/     # UI components (layout, dashboard, workspace, study, notes, ui)
│   │   │   ├── pages/          # Route-level pages (Dashboard, NotebookWorkspace)
│   │   │   ├── hooks/          # React Query and custom hooks
│   │   │   ├── lib/            # Utilities (API client, cn helper)
│   │   │   └── stores/         # Zustand state stores
│   │   ├── public/
│   │   └── index.html
│   └── api/                    # Express backend
│       ├── src/
│       │   ├── config/         # App configuration
│       │   ├── routes/         # API route handlers
│       │   ├── services/       # Business logic (AI, OCR, search)
│       │   ├── middleware/     # Auth, validation, error handling
│       │   └── utils/          # Helpers and utilities
│       ├── prisma/
│       │   └── schema.prisma   # Database schema
│       └── uploads/            # Local file storage
├── packages/
│   └── shared/                 # Shared Zod schemas and TypeScript types
│       ├── src/
│       │   ├── schemas/        # Zod validation schemas
│       │   └── types/          # Shared TypeScript interfaces
│       └── package.json
├── docker-compose.yml          # PostgreSQL (and optional Redis)
├── package.json                # Workspace root with dev scripts
└── tsconfig.json               # Base TypeScript configuration
```

---

## API Overview

All endpoints are prefixed with `/api/v1` and return a consistent envelope:

```json
{
  "data": { ... },
  "meta": { "requestId": "req_..." },
  "error": null
}
```

### Core Endpoints

| Domain | Endpoints |
|--------|-----------|
| **Auth** | `GET /me`, `PATCH /me`, `POST /auth/logout` |
| **Notebooks** | `GET /notebooks`, `POST /notebooks`, `GET /notebooks/:id`, `PATCH /notebooks/:id`, `DELETE /notebooks/:id` |
| **Sources** | `GET /notebooks/:id/sources`, `POST /sources/url`, `POST /sources/text`, `POST /sources/upload-intent`, `POST /sources/upload-complete`, `PATCH /sources/:id` |
| **Chat** | `GET /notebooks/:id/chat/messages`, `POST /notebooks/:id/chat/messages` (SSE stream), `POST /chat/messages/:id/feedback` |
| **Studio** | `GET /notebooks/:id/outputs`, `POST /notebooks/:id/generations`, `GET /generations/:id`, `GET /outputs/:id` |
| **Notes** | `GET /notebooks/:id/notes`, `POST /notebooks/:id/notes`, `PATCH /notes/:id`, `DELETE /notes/:id` |
| **Sharing** | `GET /notebooks/:id/shares`, `POST /notebooks/:id/shares`, `PATCH /shares/:id`, `DELETE /shares/:id` |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and backend concurrently |
| `npm run build` | Build shared package, then API, then web |
| `npm run db:generate` | Generate Prisma Client from schema |
| `npm run db:migrate` | Run database migrations |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run lint` | Run ESLint across the monorepo |
| `npm run typecheck` | Run TypeScript checks without emitting |

---

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   React App     │◄────►│   Node.js API    │◄────►│   PostgreSQL    │
│  (shadcn/ui)    │      │   (Express)      │      │   (Prisma ORM)  │
└─────────────────┘      └──────────────────┘      └─────────────────┘
        │                         │
        │                ┌────────┼────────┐
        │                ▼        ▼        ▼
        │           ┌────────┐ ┌─────┐ ┌──────────┐
        │           │ Gemini │ │OCR  │ │ Web      │
        │           │  API   │ │Service│ │ Search   │
        │           └────────┘ └─────┘ └──────────┘
        ▼
   ┌─────────────┐
   │ Tesseract.js│
   │ (client OCR)│
   └─────────────┘
```

**Data Flow:**
1. User uploads a file → stored in object storage → queued for processing
2. OCR extracts text → content is chunked and indexed
3. User selects sources and asks a question → backend retrieves relevant chunks
4. Gemini generates a streamed response with inline citations
5. Studio jobs generate structured outputs (quizzes, flashcards) asynchronously
6. Frontend polls job status and renders outputs when complete

---

## Key Design Decisions

- **Clerk for Auth** — Handles sign-in, sessions, and password reset out of the box. The backend syncs Clerk users to a local `users` table for relational data.
- **Three-Pane Workspace** — Sources (left) | Chat (center) | Studio (right). Keeps all study actions in a single view.
- **Source-Grounded Chat** — All AI responses are grounded in the user's selected sources. Citations map generated text back to specific source chunks.
- **Async Job Pattern** — Studio generations (quiz, flashcards, etc.) are queued jobs. The frontend polls for status, avoiding request timeouts.
- **Hybrid OCR** — Tesseract.js runs client-side for instant feedback; server-side Sharp + Tesseract handles heavy processing.
- **Upload-Intent Pattern** — The backend issues short-lived signed URLs for file uploads. The frontend never receives long-lived storage credentials.

---

## Authors

- **Crystal Juta** — R251505Y
- **Patiance Staicey Ndlovu** — R251438X

Computer Science  
Artificial Intelligence Research Area

---

## Acknowledgements

- [Holmes, Bialik & Fadel](https://curriculumredesign.org/) — *Artificial Intelligence in Education: Promises and Implications for Teaching and Learning* (2019)
- [Chen et al.](https://aclanthology.org/P17-1171/) — *Reading Wikipedia to Answer Open-Domain Questions*, ACL (2017)
- Google Gemini API for AI capabilities
- Clerk for authentication infrastructure
