# Tour anchor audit: sidebar, Profile & Settings, settings drawer

Admin Settings internals excluded (entry `sidebar.admin-settings` is anchored). Headline: the whole Profile & Settings modal (`components/settingsModal/**`) and the Classes/PLCs sub-panels have no anchors. `SidebarBoardsActive.tsx` is dead code (only its test imports it) — delete rather than anchor.

## Sidebar.tsx / footer

| File:line                                      | Element                   | Proposed id                | Flags              |
| ---------------------------------------------- | ------------------------- | -------------------------- | ------------------ |
| Sidebar.tsx:296                                | Shorten URL (admin)       | `sidebar.shorten-url`      | admin-only         |
| Sidebar.tsx:659                                | Google Drive nav          | `sidebar.google-drive`     | panel              |
| Sidebar.tsx:842                                | Sign out                  | `sidebar.sign-out`         | destructive        |
| Sidebar.tsx:854 / DevSyncFromProdButton.tsx:79 | Sync from prod (dev only) | `sidebar.dev-sync`         | destructive        |
| DevSyncFromProdButton.tsx:58                   | Replace dev copy? confirm | `sidebar.dev-sync-confirm` | panel, destructive |
| DevSyncFromProdButton.tsx:67                   | Cancel                    | `sidebar.dev-sync-cancel`  | panel              |

## SidebarGoogleDrive.tsx

| File:line | Element              | Proposed id               | Flags              |
| --------- | -------------------- | ------------------------- | ------------------ |
| :131      | Refresh              | `google-drive.refresh`    | panel              |
| :140      | Disconnect           | `google-drive.disconnect` | panel, destructive |
| :151      | Connect Google Drive | `google-drive.connect`    | panel              |

## SidebarClasses.tsx

| File:line | Element                      | Proposed id                    | Flags              |
| --------- | ---------------------------- | ------------------------------ | ------------------ |
| :469      | New Class                    | `classes.new-class`            | panel              |
| :481      | ClassLink import             | `classes.import-classlink`     | panel, conditional |
| :499      | Link Schoology sections CTA  | `classes.link-schoology`       | panel, conditional |
| :561      | Set active star (per roster) | `classes.set-active`           | panel              |
| :620      | Edit class                   | `classes.edit-roster`          | panel              |
| :666      | Sync with ClassLink          | `classes.sync-classlink`       | panel, conditional |
| :687      | Link to Google Classroom     | `classes.link-classroom`       | panel              |
| :702      | Delete class                 | `classes.delete-roster`        | panel, destructive |
| :770      | Unlink (Classroom modal)     | `classes.classroom-unlink`     | panel, destructive |
| :785      | Cancel (Classroom modal)     | `classes.classroom-cancel`     | panel              |
| :792      | Link Class confirm           | `classes.classroom-confirm`    | panel              |
| :842      | Try again                    | `classes.classroom-retry`      | panel              |
| :874      | Course row                   | `classes.classroom-course-row` | panel              |

Follow-up: roster editor, ClassLink import dialog and Link Schoology modal not audited.

## SidebarPlcs.tsx, PlcEditModal.tsx, PlcInvitesModal.tsx

| File:line               | Element           | Proposed id              | Flags              |
| ----------------------- | ----------------- | ------------------------ | ------------------ |
| SidebarPlcs.tsx:341     | New PLC           | `plcs.new-plc`           | panel              |
| SidebarPlcs.tsx:350     | Invites           | `plcs.invites`           | panel              |
| SidebarPlcs.tsx:110     | Open PLC card     | `plcs.open-plc`          | panel              |
| SidebarPlcs.tsx:170     | PLC actions kebab | `plcs.actions-menu`      | panel              |
| SidebarPlcs.tsx:197     | Edit/View PLC     | `plcs.edit-plc`          | panel              |
| SidebarPlcs.tsx:208     | Delete PLC        | `plcs.delete-plc`        | panel, destructive |
| SidebarPlcs.tsx:218     | Leave PLC         | `plcs.leave-plc`         | panel, destructive |
| PlcEditModal.tsx:186    | Name input        | `plc-edit.name`          | panel              |
| PlcEditModal.tsx:241    | Remove member     | `plc-edit.remove-member` | panel, destructive |
| PlcEditModal.tsx:270    | Invite email      | `plc-edit.invite-email`  | panel              |
| PlcEditModal.tsx:280    | Invite            | `plc-edit.send-invite`   | panel              |
| PlcEditModal.tsx:317    | Revoke invite     | `plc-edit.revoke-invite` | panel, destructive |
| PlcEditModal.tsx:338    | Cancel            | `plc-edit.cancel`        | panel              |
| PlcEditModal.tsx:345    | Create/Save       | `plc-edit.save`          | panel              |
| PlcInvitesModal.tsx:113 | Decline           | `plc-invites.decline`    | panel, destructive |
| PlcInvitesModal.tsx:126 | Accept            | `plc-invites.accept`     | panel              |

## Profile & Settings (components/settingsModal/)

| File:line                     | Element                          | Proposed id                                                               | Flags              |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------- | ------------------ |
| SettingsModal.tsx:194         | Mobile back                      | `profile.mobile-back`                                                     | panel              |
| SettingsModal.tsx:217         | Close                            | `profile.close`                                                           | panel              |
| SettingsModal.tsx:106, 256    | Rail tabs / mobile rows          | `profile.tab-{profile,appearance,dock,behavior,widget-defaults,language}` | panel              |
| ProfileSection.tsx:96         | Building toggle                  | `profile.building-toggle`                                                 | panel              |
| ProfileSection.tsx:140        | Reset grades to building default | `profile.reset-grades`                                                    | panel              |
| ProfileSection.tsx:164        | Grade chip                       | `profile.grade-chip`                                                      | panel              |
| ProfileSection.tsx:202        | Subject chip                     | `profile.subject-chip`                                                    | panel              |
| AppearanceSection.tsx:112     | Font change/close                | `appearance.font-toggle`                                                  | panel              |
| AppearanceSection.tsx:123     | Font selector                    | `appearance.font-selector`                                                | panel              |
| AppearanceSection.tsx:147     | Font option                      | `appearance.font-option`                                                  | panel              |
| AppearanceSection.tsx:182     | Window transparency              | `appearance.transparency-slider`                                          | panel              |
| AppearanceSection.tsx:219     | Corner radius option             | `appearance.corner-option`                                                | panel              |
| AppearanceSection.tsx:68      | Color pickers (×3)               | `appearance.color-picker`                                                 | panel              |
| AppearanceSection.tsx:56      | Color reset (×3)                 | `appearance.color-reset`                                                  | panel              |
| AppearanceSection.tsx:268     | Reset all colors                 | `appearance.reset-all-colors`                                             | panel, destructive |
| DockSection.tsx:75            | Dock position                    | `dock.position-option`                                                    | panel              |
| DockSection.tsx:111           | Dock transparency                | `dock.transparency-slider`                                                | panel              |
| DockSection.tsx:148           | Dock corner option               | `dock.corner-option`                                                      | panel              |
| DockSection.tsx:175           | Dock text color                  | `dock.text-color`                                                         | panel              |
| DockSection.tsx:186           | Text shadow                      | `dock.text-shadow-toggle`                                                 | panel              |
| BehaviorSection.tsx:46        | Disable close warning            | `behavior.close-warning-toggle`                                           | panel              |
| BehaviorSection.tsx:71        | Remote control                   | `behavior.remote-control-toggle`                                          | panel              |
| LanguageSection.tsx:38        | Language option                  | `language.option`                                                         | panel              |
| WidgetDefaultsSection.tsx:136 | Clear widget type                | `widget-defaults.clear-type`                                              | panel, destructive |
| WidgetDefaultsSection.tsx:173 | Remove key                       | `widget-defaults.remove-key`                                              | panel, destructive |

## SettingsDrawer.tsx

| File:line | Element        | Proposed id             | Flags            |
| --------- | -------------- | ----------------------- | ---------------- |
| :550      | Clear search X | `settings.clear-search` | panel, perWidget |
