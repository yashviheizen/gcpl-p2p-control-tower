# Users / Administration and Master Data: developer handoff

**Scope**
- Covers the `/admin` and `/master-data` modules of the GCPL P2P Control Tower prototype.
- Gold Layer is out of scope.
- See `design-system.md` for the visual spec and `theme.gcpl.css` for the tokens.

> **Everything in these modules is a browser-only simulation.**
> - There is no backend, no authentication, no Microsoft SSO and no email.
> - "Permissions" control only what the prototype renders. They are **not security**.
> - State lives in the browser's `localStorage` (keys prefixed `gcpl`).
> - "Reset demo" in the top bar restores the fixtures.
> - The UI says this on every relevant surface: the Administration callout, the "Simulation" badge, the dialog notes and the blocked-route message.

---

## 1. Routes

| Route | Required permission | Tabs |
|---|---|---|
| `/admin` | `view.admin` (editing needs `admin.manage`) | Users · Permission groups · Audit history (local state, not in the URL) |
| `/master-data/:section` | `view.masterData` (editing needs `masterData.edit`) | One URL per section: `product-hierarchy` · `vendors` · `uom-conversions` · `operating-calendars` · `calendar-exceptions` · `code-mappings` · `parameters` · `change-history`. `/master-data` and unknown slugs redirect (replace) to `product-hierarchy`. Tabs, sidebar links and Back/Forward stay in sync. |
| `/sku/:code` | `view.controlTower` | SKU investigation, linked from the hierarchy node detail |

**Blocked routes**
- `RouteGuard` (`src/app/AppShell.tsx`) checks the route prefixes in `src/app/nav.ts`.
- A blocked route shows "Not available for this demo persona" and "(Prototype simulation – not production security.)".
- Sidebar items for blocked routes are removed.

**Source files**
- `src/pages/setup/Admin.tsx`
- `src/pages/setup/MasterData.tsx`, `MasterForms.tsx`, `HierarchyTab.tsx`
- `src/pages/setup/shared.tsx`: Field, ConfirmDialog, validators, the `saveMaster` and `logActivity` helpers
- `src/lib/store.ts`: fixtures, persona-to-group map, `can()`
- `src/data/types.ts`: `Permission`, `PermissionGroup`, `DemoUser`

---

## 2. Permission model

### 2.1 Permissions

`view.overview`, `view.controlTower`, `view.planning`, `plan.upload`, `view.exceptions`, `exceptions.edit`, `view.dataOps`, `reports.upload`, `view.masterData`, `masterData.edit`, `view.admin`, `admin.manage`, `export.data`, `assistant.use`.

### 2.2 Built-in groups (fixtures)

| Group | Master data | Admin | Default persona |
|---|---|---|---|
| Supply Planner (`G-PLANNER`) | view | — | Planner (Ananya Rao) |
| Data Operator (`G-OPERATOR`) | view + **edit** | — | Operator (Rohit Kulkarni) |
| Admin (`G-ADMIN`) | view + edit | view + **manage** | Admin (Farah Siddiqui) |
| Viewer (`G-VIEWER`) | — | — | Viewer (Vikram Shah) |

### 2.3 Behaviour by permission (verified in the browser)

| Persona / group | `/master-data` | `/admin` |
|---|---|---|
| Planner | Read-only: "Read-only for this persona" badge; no Add, edit or remove controls | Blocked |
| Operator | Full edit | Blocked |
| Admin | Full edit | Full manage |
| Viewer | Blocked; no Setup links in the sidebar | Blocked |
| Custom group with `view.admin` only | — | Read-only: lists and audit visible; no Invite, Edit access or Deactivate; permission checkboxes disabled |

### 2.4 Persona switching
- The "Demo controls" menu in the top bar switches between the four personas.
- Which **group** each persona uses is set on Permission groups → "Demo personas". Changing it takes effect immediately.
- **Lock-out guard**: the current persona can only be moved to a group that has `view.admin` and `admin.manage`. Other options are disabled and labelled "(no admin access)". Those two permissions cannot be removed from the current persona's group.

---

## 3. Users (`/admin` → Users)

### Flows

| Flow | Interaction | Result (local) | Audit entry |
|---|---|---|---|
| List / search | Search by name or email; filtering everything out shows "No users match" | — | — |
| Invite | **Invite user** opens a dialog with name, email, permission group and vendor scope | New user with status **Invited**. Dialog note: no email is sent. | "Invited user (local demo – no email sent)" |
| Edit access | Row **Edit access** opens a dialog with group and vendor scope | Updates the user. No-op if nothing changed. | "Changed user access" with a diff |
| Revoke invite | Row **Revoke invite**, then confirm "Revoke invitation?" | Status Disabled, badge "Invite revoked" | "Revoked invitation" |
| Restore invite | Row **Restore invite** (no confirmation; it is non-destructive) | Back to **Invited** | "Restored invitation (local demo – no email sent)" |
| Deactivate | Row **Deactivate**, then confirm "Deactivate user?" | Status Disabled, badge "Deactivated" | "Deactivated user" |
| Reactivate | Row **Reactivate** | Back to **Active** | "Reactivated user" |

### Validation
- **Name** is required.
- **Email**:
  - required;
  - must match `x@y.z`;
  - must be unique (case-insensitive) → "A user with this email already exists.";
  - stored in lower case.
- Group defaults to **Viewer** (least privilege).
- Vendor scope: none selected means all vendors.

### States
- Active, Invited (with the invited date and time), and Disabled, which shows as either "Deactivated" or "Invite revoked" (an invite revoked before it was accepted).

---

## 4. Permission groups (`/admin` → Permission groups)

| Flow | Notes |
|---|---|
| Select group | Listbox "Permission groups" on the left; the permission matrix on the right |
| Toggle permission | Checkbox per permission; audit "Granted permission" or "Revoked permission". Lock-out permissions are disabled for the current persona's group. |
| New group | Empty, or cloned from an existing group. Name required and unique (case-insensitive). Audit "Created permission group". |
| Rename | Same name rules. Audit "Renamed permission group". |
| Reset to defaults | Built-in groups only. Enabled only when the group has been modified. |
| Delete | Custom groups only. Disabled while any user or persona uses the group (tooltip: "Group is assigned to users or personas"). Asks to confirm "Delete permission group?" before deleting. |
| Demo personas | Maps each persona to a group (see §2.4) |

## 5. Audit history (`/admin` → Audit history)

- One searchable log of every demo change in the browser: exceptions, planning, uploads, master data and administration.
- Columns: when, who (the current persona's name), area, action, record, detail.
- The log is stored locally and cleared by Reset demo.

---

## 6. Master data (`/master-data`)

- A blue callout at the top of the page states that edits are local only and recalculate the demo dataset.
- Every form dialog carries the note "Saved only in this browser for the demo – no GCPL system is updated."
- Every change is logged to **Change history**, filtered to the Master data area, with a diff summary.

| Tab | View | Edit (needs `masterData.edit`) | Validation |
|---|---|---|---|
| **Product hierarchy** | ARIA tree with arrow, Home and End key navigation; search with highlighting; node detail panel; Tree/Table toggle | Add DT, add FG SKU, edit node | **SKU code**: 4–20 characters, `[A-Z0-9-]`, unique. **Name** required. **DT** required. **Case pack** is a whole number > 0. **kg** is optional and must be > 0 if given. **Shelf life** is a whole number. |
| **Vendors** | Vendor table (code, location, calendar, report sender, SKU count) plus the Vendor–SKU relationships table | Add or edit vendor; add relationship; **remove relationship (confirmed)** | Vendor name and code required and unique; the id becomes `V-{code}`. Report email must be valid. A relationship's SKU must exist and must not duplicate an existing pair. |
| **UOM conversions** | FG conversions per SKU, and RM/PM materials | Edit conversion (SKU form in UOM-only mode) | Case pack is a whole number > 0; kg is optional and must be > 0 if given. A callout warns about SKUs with no weight. Different UOMs are never summed. |
| **Operating calendars** | Weekly patterns | Add or edit calendar | At least one operating day |
| **Calendar exceptions** | Holidays and extra working days | Add; **remove (confirmed)** | Date required; no second exception on the same date for an overlapping calendar; reason required |
| **Code mappings** | Vendor item code → FG SKU, per vendor | Add or edit; **remove (confirmed)** | Code unique per vendor; FG code must exist. Warns if the vendor has no relationship with that SKU. |
| **Parameters** | Thresholds used by statuses and exceptions, each flagged as a demo assumption | Edit value | Value ≥ 0. Whole numbers for non-% units. Attainment low must be below high. |
| **Change history** | Searchable log; "No changes match" when filtering empties it | — | — |

**Confirmation copy** (all use the shared `ConfirmDialog`: Cancel has initial focus, the action button is styled as danger, and a local-only note is shown):
- **Remove vendor–SKU relationship?**
  - Names the vendor and SKU.
  - Explains that the pair drops out of analysis.
  - Warns that any code mappings will show "No vendor relationship".
- **Remove calendar exception?**
- **Remove code mapping?** Explains that rows with that code will be excluded at upload with an "unmapped code" warning.

**Not supported (by design, so far)**
- delete or deactivate a vendor;
- delete a SKU or DT;
- delete a calendar;
- bulk import of master data.

---

## 7. What is demo-only vs what needs backend implementation

| Area | Prototype (demo-only) | Needs backend / real implementation |
|---|---|---|
| Authentication | A cookie-gated demo login; personas switched from a menu | Microsoft Entra ID (SSO) or the chosen IdP; real sessions. **Not connected; do not imply otherwise.** |
| Authorisation | `can(permission)` in the client hides UI and guards routes | Server-side enforcement on every API. The client checks remain for UX only. |
| Users ↔ personas | Demo users are a separate list. Editing a demo user's group **does not** change what any persona sees. | Users are real identities; group membership drives the session's permissions |
| Invitations | Adds an "Invited" row; **no email** | Invite email or IdP provisioning, expiry, resend, acceptance → Active |
| Vendor scope | Stored and displayed only; **does not filter any data** | Row-level filtering of every vendor-bound query (production, dispatch, inventory, PO, exceptions, uploads) |
| Deactivate / revoke | Status flag | Revoke sessions and tokens; block sign-in; keep history |
| Permission groups | Local CRUD with a lock-out guard | Server-side CRUD, the same lock-out rule (never remove the last admin), migration of built-in defaults |
| Master data | Local edits recalculate the in-memory demo dataset | Real tables with versioning, effective dates, approval (if required) and downstream recalculation jobs |
| IDs | `U-{base36 time}`, `V-{code}` | Server-generated IDs; codes stay as business keys |
| Audit / change history | `localStorage`; "who" is the persona name | Append-only server audit with the authenticated user, timestamp and before/after values |
| Persistence | `localStorage`; Reset demo restores fixtures | Database |
| Validation | Client-side only | Repeat every rule on the server (uniqueness especially) |

---

## 8. Changes made in this handoff pass (local, not pushed)

1. **Users: Edit access.**
   - Vendor scope could only be set at invite time, and the group was a bare inline select with no audit diff.
   - There is now an "Edit access" dialog for group and vendor scope, with a simulation note and a diffed audit entry.
2. **Users: confirmations.**
   - Deactivate and Revoke invite now confirm first.
   - A restored revoked invite now returns to **Invited**; it previously jumped to Active.
   - Revoked invites are labelled "Invite revoked".
3. **Groups: confirmation** added to Delete group.
4. **Master data: confirmations** added to remove relationship, remove calendar exception and remove code mapping. These were previously one-click deletes.
5. **Empty states:**
   - Users search → "No users match".
   - Change history search → "No changes match". It previously said "No changes recorded" while filtering.
6. **Shared UI:** new `ConfirmDialog` and `useConfirm()` in `src/pages/setup/shared.tsx`, plus a `VendorScopeField` in Admin.

---

## 9. Unresolved questions (need GCPL / product input)

1. **Identity provider and provisioning**:
   - Entra ID groups mapped to app groups, or groups managed in the app?
   - Is a user invited, or created automatically on first SSO login?
2. **Vendor scope semantics**:
   - Does an empty scope mean *all* vendors, or *none*? The prototype uses *all*.
   - Should scope apply to admins?
   - Is it per user, or per group?
3. **Invite lifecycle**: expiry, resend, and who can invite. Is `admin.manage` enough?
4. **Deactivation**: does it remove the user's open exception assignments? Can a deactivated user be deleted (GDPR or retention)?
5. **Last-admin rule**: the prototype protects the *current persona*. The real rule is probably "at least one active admin must exist".
6. **Master data source of truth**: which tables are maintained here, and which are synced from SAP or other systems? That decides whether edits are allowed at all.
7. **Master data approvals**: should edits need maker-checker approval, effective dates or versioning?
8. **Deletes**: vendor, SKU, DT and calendar deletion or deactivation is not built. Is soft-deactivate required?
9. **Relationship "since" date**: the default is the demo date (9 Oct 2026). Should it be user-editable?
10. **Parameters**: every threshold is flagged as a provisional demo assumption pending business confirmation.
11. **Deep links**: master-data sections have their own URLs (`/master-data/<section>`). Admin tabs are still not in the URL. Should `/admin/groups` etc. follow the same pattern?

---

## 10. Verification performed

- Browser e2e run in real Chrome via Playwright against the dev server, covering everything in §§3–6 and all four personas plus a custom read-only group: **79 passed, 0 failed, no console errors**.
- Type-check, lint, unit tests and build: see the final report in the session.
