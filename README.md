# SPART Board

**A professional-grade interactive management board for classrooms.**

## 📋 Overview

SPART Board is an interactive, widget-based application built with **React 19**, **TypeScript**, and **Vite**. It provides teachers with a customizable, drag-and-drop interface containing over 20 specialized classroom tools—from timers and noise meters to polling and lunch counts. All data is synchronized in real-time using **Firebase**.

## ✨ Key Features

- **🧩 Widget System:** 21+ interactive widgets including Timers, Stopwatches, Noise Meters, Drawing Boards, Random Pickers, Traffic Lights, Expectations, and more.
- **☁️ Real-Time Persistence:** Dashboards are saved and synced instantly via Firebase Firestore.
- **🔐 Authentication:** Secure Google Sign-In integration.
- **🛡️ Admin Controls:** Granular feature permissions (Public/Beta/Admin) and user management.
- **🎨 Customization:** Drag-and-drop layout, resizable widgets, custom backgrounds, and a professional design system featuring 'Lexend' and 'Patrick Hand' fonts.
- **🤖 AI Integration:** Features powered by Google Gemini (e.g., OCR text extraction in the Webcam widget).

## 🚀 Getting Started

### Option 1: GitHub Codespaces (Recommended)

The easiest way to start coding is with GitHub Codespaces. This environment comes pre-configured with the Gemini CLI and all necessary dependencies.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/OPS-PIvers/SPART_Board)

1.  Click the button above.
2.  Wait for the environment to load.
3.  Follow the prompts in the terminal to authenticate with Gemini.

### Option 2: Local Development

**Prerequisites:** Node.js (v20+ recommended)

1.  **Clone the repository:**

    ```bash
    git clone [https://github.com/OPS-PIvers/SPART_Board.git](https://github.com/OPS-PIvers/SPART_Board.git)
    cd SPART_Board
    ```

2.  **Install dependencies:**

    ```bash
    pnpm install
    ```

3.  **Configure Environment:**
    Create a `.env.local` file in the root directory and add your credentials:

    ```env
    VITE_FIREBASE_API_KEY=your_key
    VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your_project_id
    VITE_FIREBASE_STORAGE_BUCKET=your_bucket.appspot.com
    VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    VITE_FIREBASE_APP_ID=your_app_id
    VITE_GEMINI_API_KEY=your_gemini_key
    ```

4.  **Run the app:**
    ```bash
    pnpm run dev
    ```

## 🛠 Tech Stack

- **Frontend:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS (Custom Brand Theme), Lucide React (Icons)
- **Fonts:** Lexend (UI), Patrick Hand (Handwritten), Roboto Mono (Code)
- **Backend:** Firebase (Auth, Firestore, Storage)
- **AI:** Google Gemini API (`@google/genai`)
- **Tooling:** ESLint, Prettier, Husky

## 📂 Project Structure

This project uses a **flat file structure** (no `src/` directory). All source code resides at the project root.

- `components/` - React components (Widgets, Layout, Admin, Auth)
- `context/` - Global state (Dashboard & Auth contexts)
- `hooks/` - Custom React hooks (`useFirestore`, `useStorage`)
- `config/` - App configuration
- `types.ts` - TypeScript definitions and Widget registry

## 📜 Available Scripts

- `pnpm run dev` - Start the development server
- `pnpm run build` - Build for production
- `pnpm run preview` - Preview the production build
- `pnpm run validate` - Run type-check, linting, and formatting checks
- `pnpm run format` - Auto-format code with Prettier

## 🤖 AI Development Workflow

This repository is optimized for AI-assisted development using the **Gemini CLI**.
Common slash commands available in the codespace:

- `/preview` - Save changes and update the preview URL.
- `/submit` - Create a Pull Request for review.
- `/sync` - Update your workspace with the latest changes.
- `/clean` - Discard unsaved changes.
- `/undo` - Revert the most recent save (commit/push) to rewind back to previous `/preview` while retaining code changes in the branch.

## 📄 License

Private Repository. All rights reserved.
