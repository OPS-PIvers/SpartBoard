# SpartBoard Chrome extension

Web tours now, focus sessions later. The contract is [docs/plans/CHROME_EXTENSION.md](../docs/plans/CHROME_EXTENSION.md).

- `pnpm -C extension run build` builds both listings into `dist/prod/` and `dist/dev/` (load either unpacked from `chrome://extensions`); `pnpm run build:extension` also zips them, as CI does on every PR.
- Type-check and lint run in their own passes (`pnpm -C extension run type-check`, `pnpm run lint:extension`); tests run in the root Vitest suite.
- Only `@types/chrome` is installed here. Vite, React, i18next and Tailwind come from the root `node_modules`, and `@/` is the repo root, as in the app.

## Layout

- `manifest.json`: the base manifest. Bump `version` here to publish (D7). `src/listings.ts` holds each listing's name and exact page origins (D5).
- `src/serviceWorker.ts`: refuses senders that aren't a top frame on a listed origin (`src/sender.ts`), checks every message against `components/tours/web/extensionProtocol.ts` and answers it in `src/handler.ts`. Page ports are refused until a protocol version defines one.
- `src/overlay/`: the tour overlay (`TourSpotlight`, `TourBar` without Autopilot, `TourTip`) in a closed Shadow DOM with its own i18n instance. Its CSS is compiled with the app's Tailwind theme and every `rem` rewritten to `px`, so the host page's font size can't rescale it.

## Adding a message type

Add it to the `ExtensionMessage` union and `MESSAGE_SPECS` in `extensionProtocol.ts` (fields and `staffOnly`), bump `EXTENSION_PROTOCOL_VERSION`, and add its `case` in `src/handler.ts`, with tests for both.
