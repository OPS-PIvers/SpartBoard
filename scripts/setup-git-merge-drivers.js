import { execSync } from 'child_process';

// Registers the custom git merge drivers referenced by .gitattributes.
//
// .gitattributes marks `docs/routines/unifier.md` with `merge=ours`. Git has
// NO built-in driver named `ours` (the only built-in per-file drivers are
// `text`, `binary`, and `union`), so the attribute is inert until a matching
// `merge.ours.driver` is configured. Without it, a `main → dev-paul` merge
// produces a 3-way conflict (with markers) on the file instead of keeping
// dev-paul's copy — the exact clobber the attribute is meant to prevent.
//
// `driver = true` runs the shell built-in `true` (exit 0, leaves the
// current-branch / "ours" version untouched), giving clean keep-ours
// semantics with no conflict.
//
// This runs from the `prepare` lifecycle script on every install, so each
// clone gets the driver registered automatically. It is intentionally
// best-effort: a missing git binary or a non-repo checkout (e.g. tarball
// install) must never fail the install.

try {
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  execSync('git config merge.ours.driver true', { stdio: 'ignore' });
} catch {
  // Not a git checkout, or git unavailable — nothing to configure. The
  // in-file warning block in unifier.md remains the manual fallback.
}
