/**
 * In-memory mock store for `/dashboard_templates/` in auth-bypass / E2E mode.
 *
 * Mirrors the `MockSharedCollectionStore` singleton pattern in
 * `hooks/useSharedCollection.ts`. Without this, `SaveAsTemplateModal` writes
 * to a `{}` stub db (addDoc throws) and `CreateFromTemplateModal` returns an
 * empty list (short-circuits on isAuthBypass with no data source).
 *
 * The store is a module-level singleton backed by `sessionStorage` so that
 * multi-step E2E flows (write template in step 8, read it in step 11) survive
 * cross-navigation without needing a real Firestore connection.
 *
 * No observer pattern — callers read synchronously from `getAll()`. This is
 * sufficient for E2E flows where write and read happen in separate modal
 * lifecycles (the test closes one modal before opening the next). YAGNI.
 */

import type { AnyTemplate } from '@/types';

const STORAGE_KEY = 'mock_dashboard_templates';

class MockTemplateStore {
  private static instance: MockTemplateStore;
  private items = new Map<string, AnyTemplate>();
  private hydrated = false;

  private constructor() {
    // Private constructor enforces singleton via getInstance()
  }

  static getInstance(): MockTemplateStore {
    if (!MockTemplateStore.instance) {
      MockTemplateStore.instance = new MockTemplateStore();
    }
    return MockTemplateStore.instance;
  }

  private hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AnyTemplate[];
        for (const t of parsed) this.items.set(t.id, t);
      }
    } catch {
      // sessionStorage unavailable (e.g. sandboxed iframe) — in-memory only
    }
  }

  private persist(): void {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(this.items.values()))
      );
    } catch {
      // sessionStorage unavailable — in-memory only
    }
  }

  /** Upsert a template by id. Hydrates from sessionStorage on first call. */
  save(template: AnyTemplate): void {
    this.hydrate();
    this.items.set(template.id, template);
    this.persist();
  }

  /**
   * Returns all templates sorted by createdAt descending — matches the
   * production Firestore query `orderBy('createdAt', 'desc')`.
   * Hydrates from sessionStorage on first call.
   */
  getAll(): AnyTemplate[] {
    this.hydrate();
    return Array.from(this.items.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }
}

export const mockTemplateStore = MockTemplateStore.getInstance();
