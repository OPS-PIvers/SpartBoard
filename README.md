# SpartBoard

**A professional-grade interactive management board for classrooms.**

## 📋 Overview

SPART Board is an interactive, widget-based application built with **React 19**, **TypeScript**, and **Vite**. It provides teachers with a customizable, drag-and-drop interface containing over 55 specialized classroom tools—from timers and noise meters to quizzes, guided learning, and music stations. All data is synchronized in real-time using **Firebase**.

## ✨ Key Features

- **🧩 Widget System:** 57 interactive widgets including Timers, Noise Meters, Drawing Boards, Quizzes, Video Activities, Guided Learning, Music Stations, Seating Charts, and more.
- **☁️ Real-Time Persistence:** Dashboards are saved and synced instantly via Firebase Firestore.
- **🔐 Authentication:** Secure Google Sign-In integration.
- **🛡️ Admin Controls:** Granular feature permissions (Public/Beta/Admin) and user management.
- **🎨 Customization:** Drag-and-drop layout, resizable widgets, custom backgrounds, and a professional design system featuring 'Lexend' and 'Patrick Hand' fonts.
- **🤖 AI Integration:** Features powered by Google Gemini (e.g., OCR text extraction in the Webcam widget, intelligent mini-app generation).
- **📶 Resilience:** Multi-proxy fallback mechanism for weather and API-driven widgets to bypass CORS restrictions.
- **🎓 Student Apps:** Live quiz sessions, video activities, guided learning, activity walls, and mini-apps accessible via join codes.
- **📱 Remote Control:** Mobile-friendly remote for controlling widgets from a phone.
- **🌐 Internationalization:** Multi-language support via i18next.
- **📋 Roster Integration:** ClassLink roster import and student management.

## 🛠 Tech Stack

- **Frontend:** React 19, TypeScript 5.x, Vite
- **Styling:** Tailwind CSS (Custom Brand Theme), Lucide React (Icons)
- **Fonts:** Lexend (UI), Patrick Hand (Handwritten), Roboto Mono (Code)
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions)
- **State Management:** React Context (4 contexts: Dashboard, Auth, CustomWidgets, Dialog) + Firestore (real-time)
- **AI:** Google Gemini API (`@google/genai`)
- **Testing:** Vitest (Unit & Coverage via `@vitest/coverage-v8`), Playwright (E2E)
- **Tooling:** ESLint, Prettier, Husky, Lint-staged

## 🗄️ State Management

- **`DashboardContext`**: The central store for dashboard state, widgets, dock items, and rosters.
  - **Hook:** `useDashboard()` provides access to state and actions (e.g., `addWidget`, `updateWidget`).
- **`AuthContext`**: Manages user authentication and role-based access (Admin vs. User).
- **Persistence**:
  - **Firestore**: Real-time sync for dashboards.
  - **Google Drive**: Automatic background sync for non-admins via `useGoogleDrive`.
  - **LocalStorage**: Persists tool visibility and dock organization.

## 🧩 Widget System

Widgets are the core building blocks of the dashboard. They are modular, draggable, and resizable.

- **Registry**: `components/widgets/WidgetRegistry.ts` maps widget types to their components and settings panels. It handles lazy loading.
- **Defaults**: Initial dimensions and configuration are defined in `config/widgetDefaults.ts`.
- **Grade Levels**: `config/widgetGradeLevels.ts` controls which widgets are available for different grade bands.
- **Scaling Strategies**: The app uses a hybrid scaling approach, prioritizing CSS Container Queries (e.g., `cqw`, `cqh`, `cqmin`) for newer widgets to ensure responsiveness.
- **Nexus (Inter-Widget Communication)**: Widgets can communicate via the "Nexus" system. They can "push" actions (e.g., Randomizer triggering a Timer) or "pull" data (e.g., Weather widget reading location).

## 🚀 Getting Started

### Option 1: GitHub Codespaces (Recommended)

The easiest way to start coding is with GitHub Codespaces. This environment comes pre-configured with the Gemini CLI and all necessary dependencies.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=OPS-PIvers/SPART_Board)

1.  Click the button above.
2.  Wait for the environment to load.
3.  Follow the prompts in the terminal to authenticate with Gemini.

### Option 2: Local Development

**Prerequisites:** Node.js (v20+ recommended), pnpm (v10+)

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/OPS-PIvers/SPART_Board.git
    cd SPART_Board
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Configure Environment:**
    Create a `.env.local` file in the root directory and add your credentials:

    ```env
    VITE_FIREBASE_API_KEY=...
    VITE_FIREBASE_AUTH_DOMAIN=...
    VITE_FIREBASE_PROJECT_ID=...
    VITE_FIREBASE_STORAGE_BUCKET=...
    VITE_FIREBASE_MESSAGING_SENDER_ID=...
    VITE_FIREBASE_APP_ID=...
    VITE_GEMINI_API_KEY=...
    VITE_OPENWEATHER_API_KEY=...
    ```

    _Note: For local development without Firebase credentials, set `VITE_AUTH_BYPASS=true` in `.env.local` to skip login and use a mock admin account._

4.  **Run the app:**
    ```bash
    pnpm run dev
    ```

## 📂 Project Structure

This project primarily uses a **flat file structure**, with most source code residing at the project root rather than in a traditional `src/` directory.

- `components/` - React components (Widgets, Layout, Admin, Auth, Common)
- `config/` - Application configuration and metadata (tools, grade levels, themes)
- `context/` - Global state management (Dashboard & Auth contexts)
- `hooks/` - Custom React hooks for Firebase, UI state, and API interactions
- `utils/` - Shared helper functions and service abstractions
- `functions/` - Firebase Cloud Functions (Node.js)
- `docs/` - Project documentation, setup guides, and architectural notes
- `scripts/` - Automation scripts (versioning, admin setup, PDM tools)
- `i18n/` & `locales/` - Internationalization setup and translation files
- `tests/` - Test setup and E2E test suites
- `types.ts` - Centralized TypeScript definitions and Widget registry

## 📜 Available Scripts

- `pnpm run dev` - Start the development server (port 3000)
- `pnpm run build` - Build the application for production
- `pnpm run preview` - Preview the production build locally
- `pnpm run validate` - Run type-check, linting, formatting check, and unit tests
- `pnpm run test` - Execute unit tests with Vitest
- `pnpm run test:e2e` - Execute end-to-end tests with Playwright
- `pnpm run test:coverage` - Generate test coverage reports
- `pnpm run lint` - Run ESLint analysis
- `pnpm run lint:fix` - Automatically fix linting errors
- `pnpm run format` - Auto-format code with Prettier

## 🤖 AI Development Workflow

This repository is optimized for AI-assisted development using the **Gemini CLI**.
Common slash commands available in the environment:

- `/preview` - Save changes and update the preview URL.
- `/submit` - Create a Pull Request for review.
- `/sync` - Update your workspace with the latest changes from main.
- `/clean` - Discard all unsaved changes and return to the last saved state.
- `/undo` - Revert the most recent save while keeping work in the editor.

## 📄 License

Private Repository. All rights reserved.
