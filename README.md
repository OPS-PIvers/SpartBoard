# SPART Board

**A professional-grade interactive management board for classrooms.**

## 📋 Overview

SPART Board is an interactive, widget-based application built with **React 19**, **TypeScript**, and **Vite**. It provides teachers with a customizable, drag-and-drop interface containing specialized classroom tools—from timers and noise meters to polling and lunch counts. All data is synchronized in real-time using **Firebase**.

## ✨ Key Features

- **🧩 Widget System:** 21+ interactive widgets including Timers, Stopwatches, Noise Meters, Drawing Boards, Random Pickers, Traffic Lights, Expectations, and more.
- **☁️ Real-Time Persistence:** Dashboards are saved and synced instantly via Firebase Firestore.
- **🔐 Authentication:** Secure Google Sign-In integration via Firebase Auth.
- **🛡️ Admin Controls:** Granular feature permissions (Public/Beta/Admin) and user management.
- **🎓 Grade Level Filtering:** Tailor the widget dock to specific educational stages (K-2, 3-5, 6-8, 9-12).
- **🎨 Customization:** Drag-and-drop layout, resizable widgets, custom backgrounds, and a professional design system featuring 'Lexend' and 'Patrick Hand' fonts.
- **🤖 AI Integration:** Features powered by **Gemini 3 Flash Preview** (e.g., OCR text extraction in the Webcam widget, intelligent mini-app generation).
- **📶 Resilience:** Multi-proxy fallback mechanism for weather and API-driven widgets to bypass CORS restrictions.

## 🚀 Getting Started

### Prerequisites

- **Node.js:** v20+ recommended.
- **pnpm:** This project uses `pnpm` for package management.

### Installation & Setup

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

4.  **Run the app:**
    ```bash
    pnpm run dev
    ```

## 🛠 Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS (Custom Brand Theme), Lucide React (Icons)
- **Fonts:** Lexend (UI), Patrick Hand (Handwritten), Roboto Mono (Code)
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Functions)
- **AI:** Google Gemini API (`@google/genai`)
- **Testing:** Vitest (Unit), Playwright (E2E), Istanbul (Coverage)
- **Tooling:** ESLint, Prettier, Husky, Lint-staged

## 📂 Project Structure

This project uses a **flat file structure** (no `src/` directory). All source code resides at the project root.

- `components/` - React components (Widgets, Layout, Admin, Auth, Common)
- `config/` - Application configuration and metadata (tools, grade levels, themes)
- `context/` - Global state management (Dashboard & Auth contexts)
- `hooks/` - Custom React hooks for Firebase, UI state, and API interactions
- `utils/` - Shared helper functions and service abstractions
- `docs/` - Project documentation, setup guides, and architectural notes
- `scripts/` - Automation scripts (versioning, admin setup, PDM tools)
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
