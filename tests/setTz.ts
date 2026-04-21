// Pin timezone to UTC so Date.prototype.toLocale* output is deterministic
// across developer machines and CI. This file must run before any other
// setup file so imports that might format dates during initialization
// (i18next plugins, jest-dom, etc.) see the correct timezone.
//
// NO imports — import statements are hoisted in ESM and would run before
// this assignment, defeating the purpose. Keep this file import-free.
process.env.TZ = 'UTC';
