1. **Optimize reduce pattern in DashboardContext.tsx**:
   - Refactor the code around line 788 and 856 where `reduce` combined with object spread (`...acc`) is being called in a hot loop inside `map()`.
   - By using a plain `for...of` loop or explicitly setting keys on an object `const acc: Partial<WidgetData> = {};`, we can avoid the overhead of creating thousands of intermediate objects via the object spread syntax inside `.reduce()`. This is particularly impactful because this code runs when syncing widget state to/from the server with potential large arrays of widgets.
2. **Complete Pre Commit Steps**:
   - I will use `pre_commit_instructions` to test, verify, review, and reflect.
3. **Commit & Submit**:
   - Create a PR titled `⚡ Bolt: Optimize DashboardContext object spread reduce performance`.
