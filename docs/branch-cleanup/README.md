# Branches to delete

Merged branches waiting for the local agent to delete them (AB-112 in `AGENT_BACKLOG.md`). Cloud sessions can't delete branches.

**Adding a branch.** Add a new file here, named after your branch with `/` turned into `-`, for example `claude-project-thread-abc123.txt`. Put one branch per line, with a short note on what it held (the PR number isn't known yet when you add the file in the same PR):

```
claude/project-thread-abc123 (speech to text grader fix)
```

Add the file in the PR that merges the work, so no separate docs PR is needed. A new file never conflicts with another PR, unlike a shared list.

**Deleting.** The local agent deletes each listed branch once its PR has merged or closed, then deletes the file. It never deletes `main`, `dev-*` or `scheduled-tasks`, or a branch with an open PR.
