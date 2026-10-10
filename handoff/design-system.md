# GCPL P2P Control Tower: design system (handoff)

The visual reference is the P2P Control Tower prototype (`src/`). The theme contract is `theme.gcpl.css`, which sits in this folder.

**How the values were taken**
- Tokens come from `src/index.css` (`@theme`). Component classes come from `src/components/ui.tsx`, `src/pages/setup/shared.tsx` and `src/app/AppShell.tsx`.
- Sizes were measured as computed styles in Chrome (1440×900, 10 Oct 2026) on `/admin` and its dialogs.
- Sizes are given in **rendered px**. The prototype's html root is **14px**, so Tailwind's `h-8` renders at 28px rather than 32px. Building with these px targets avoids drift if your root is 16px.

**Status labels used below**
- **Implemented**: exists in the prototype today.
- **Proposed**: a recommended change that is not built anywhere yet.

---

## 1. Colour

### 1.1 Neutrals and text (Implemented)

| Role | Prototype token | Value | Theme variable | Use |
|---|---|---|---|---|
| App canvas | `canvas` | `#fafafa` | `--canvas` | Page background behind cards |
| Surface | `surface` | `#ffffff` | `--background`, `--card`, `--popover` | Cards, tables, dialogs, inputs |
| Muted surface | `surface-muted` | `#f4f4f5` | `--muted`, `--secondary`, `--accent` | Table header, disabled input, hover fill |
| Hairline | `line` | `#e5e7eb` | `--border` | Card, table and divider borders |
| Strong line | `line-strong` | `#d4d4d8` | `--input` | Input, select and search borders; dashed "not yet due" outline |
| Primary text | `ink` | `#18181b` | `--foreground` | Body, values, headings (17.7:1 on white) |
| Secondary text | `ink-muted` | `#52525b` | `--muted-foreground` | Field labels, table headers, ghost buttons (7.0:1 on `#f4f4f5`) |
| Subtle text | `ink-subtle` | `#6b6b74` | *extension* `--subtle-foreground` | Hints, card subtitles, timestamps (4.8:1 on `#f4f4f5`, 5.3:1 on white) |

### 1.2 Accent: teal, restrained (Implemented)

Use teal **only** for:
- primary actions;
- the selected tab or segment;
- the active navigation item;
- the focus outline;
- the "actual" chart series.

Do not use it for decoration or for status.

| Role | Value | Theme variable | Notes |
|---|---|---|---|
| Accent | `#0f766e` | `--primary`, `--ring`, `--sidebar-primary`, `--chart-1` | White text on it is 5.47:1 |
| Accent hover | `#115e59` | *extension* `--accent-hover` | Primary button hover (7.58:1) |
| Accent soft | `#e0f2ef` | `--accent-subtle`, `--sidebar-accent` | Active nav background |
| Accent ink | `#115e59` | `--sidebar-accent-foreground` | Text on accent-soft, active tab text (6.5:1) |

### 1.3 Semantic status colours

Status is **never colour alone**. Every status pairs an icon with a text label (`StatusText` and `Badge`).

| Meaning | Prototype (Implemented) text / soft / line | Theme (preserved developer values) text / subtle | Ratio on soft |
|---|---|---|---|
| Success | `#17733e` / `#e4f4ea` / `#a6d8b8` | `#15803d` / `#dcfce7` | proto 5.18, theme 4.57 |
| Warning | `#955700` / `#fdf1dc` / `#f0c983` | `#b45309` / `#fef3c7` | proto 5.16, theme 4.51 |
| Error | `#b42318` / `#fde8e6` / `#f2b1aa` | `#b91c1c` / `#fee2e2` | proto 5.59, theme 5.30 |
| Info | `#2f5fb3` / `#e7eefb` / `#b3c7ee` | `#1d4ed8` / `#dbeafe` | proto 5.29, theme 5.49 |
| Neutral / none | `#52525b` / `#f4f4f5` | — (use `--muted-foreground` / `--muted`) | 7.03 |

- The theme **keeps the developer's semantic values** as requested. Both sets pass AA for text on their soft fill.
- Theme warning (4.51) and success (4.57) have almost no margin.
- **Proposed**: if exact parity with the prototype is wanted, adopt the prototype values. The `*-border` extensions in the theme file are prototype values.

### 1.4 Chart series (Implemented, marked provisional in the prototype)

| Series | Value | Theme |
|---|---|---|
| Actual | `#0f766e` | `--chart-1` |
| Plan | `#a1a1aa` | `--chart-2` |
| Dispatch | `#3b6fc4` | `--chart-3` |
| Inventory | `#8a5cc2` | `--chart-4` |
| — | (developer `#c98500`) | `--chart-5`, unused by the prototype |

Plan grey is 2.56:1. It is always shown as a reference line or bar next to a text legend, never as the only signal.

The developer's original palette was tested for colour-vision deficiency. This mapping was not.

### 1.5 Heatmap patterns (Implemented, component CSS, not theme)

These classes live in `src/index.css` and are component styles. They are **not** in the theme file:
- `.hatch`: a diagonal neutral hatch for a missing report.
- `.hatch-bad`: a diagonal red hatch for reported zero.
- `.dots`: a dotted pattern for a non-operating day.

---

## 2. Typography

Font in the prototype: **Inter** (Google Fonts). Font in the theme: **Avenir** (retained, see §11).

| Token | Size / line-height | Weights used | Use |
|---|---|---|---|
| `text-label` | 12 / 16 | 400, 500, 600 | Table headers (500), badges (500), hints, field errors (500), sidebar group labels (600) |
| `text-dense` | 12.5 / 18 | 400, 500 | Table cells, small buttons (500), field labels (500) |
| `text-body` | 13 / 19 | 400, 500 | Body, nav links, inputs, medium buttons (500) |
| `text-title` | 14 / 20 | 600 | Card and dialog titles, empty-state titles |
| `text-heading` | 20 / 26 | 600 | Page `h1` |
| `text-kpi` | 22 / 28 | 600 | KPI values |

- Monospace (`ui-monospace, 'SF Mono', Menlo`) is used for codes, IDs and audit targets.
- Tabular numerals are on for every `table` and `.num`.
- Root is `html { font-size: 14px; line-height: 20px }` with antialiasing.

**Proposed**: Avenir has a larger x-height than Inter. Check 12–12.5px table text with Avenir before you sign off on density.

---

## 3. Spacing, radii, borders, shadows (Implemented)

- **Spacing**: Tailwind steps of `0.25rem`. At the 14px root one step is **3.5px**, so `p-4` is 14px, `px-2.5` is 8.75px and `gap-2` is 7px.
  - Card header: 14px × 8.75px.
  - Dialog body padding: 14px.
  - Page gutter: 14–21px.
- **Radii**:

  | Element | Radius |
  |---|---|
  | Control | **6px** (`--radius-control`, theme `--radius`) |
  | Card / callout / popover | **8px** |
  | Dialog | 7px (`rounded-lg` at a 14px root) |
  | Badge, heatmap chip | **4px** |
  | Nav item | 5.25px |

- **Borders**: 1px. Use `--border` for structure and `--input` for fields. A dashed border marks "Page filters" (`LocalFilters`) and "not yet due" cells.
- **Shadows**:

  | Level | Value | Used on |
  |---|---|---|
  | Card | `0 1px 2px rgba(24,24,27,.04)` | Cards and secondary buttons |
  | Pop | `0 8px 24px rgba(24,24,27,.12), 0 1px 3px rgba(24,24,27,.08)` | Popovers, info tips, demo controls |
  | Modal | `0 25px 50px -12px rgba(0,0,0,.25)` | Dialogs and drawers |

---

## 4. Sidebar (Implemented)

| Part | Spec |
|---|---|
| Container | Background `#f5f5f5`, 1px right border `#e5e7eb`. Width **236px**, or a **60px** collapsed rail (icons only, `title` tooltips). |
| Brand block | Teal 28px tile with "P2P" and a product name / subtitle |
| Top-level link (Overview, Exceptions) | 28px high, 13px, `#3f3f46`, 16px icon, gap 8.75px |
| **Parent group** (Control Tower, Planning, Data Operations, Setup) | Button 24.5px high, **12px semibold `#52525b`**, chevron in `#71717a`, `aria-expanded`. Hover background `#ebebeb` with text `#18181b`. |
| **Child list** | Indented with a 1px left guide line `#e5e7eb` (`ml-[9px] border-l pl-1.5`) |
| Child link | 28px high, 13px regular `#3f3f46`. Hover background `#ebebeb`, text `#18181b`. |
| **Active child** | Background `#e0f2ef`, **500** weight, text `#115e59`, a **3px teal bar** on the left edge (inset 5px top and bottom), `aria-current="page"` |
| **Sub-group** (Setup → Master Data) | The parent row is a toggle button styled like a 28px link (icon, label, chevron rotating −90° when closed, `aria-expanded`, `aria-controls`). Open by default. Its 8 section links have no icons and sit in a list indented with a guide line (`ml-[17px] border-l pl-1.5`). Only the active section is highlighted. When the sub-group is closed and contains the active page, the parent row turns 500 weight `#18181b`. Navigating into a section re-opens it. |
| Collapsed rail with sub-group | A single Master Data icon, active for any section, that links to `/master-data` (the default section) |
| Count pill (Exceptions) | `rgba(0,0,0,.06)` pill, 12px |
| Group spacing | 14px between groups. All permitted groups are **open by default** (not persisted, so every session starts expanded). Navigating into a collapsed group re-opens it. |
| Focus | 2px teal outline, inset −2px (stays inside the rail) |
| Scroll | The nav scrolls independently; the active link is scrolled into view on navigation and on load |
| Permission | Groups and items hidden for a persona are removed, not disabled |

- **Proposed**: `#71717a` on `#f5f5f5` is **4.43:1**. That is fine for the chevron icon (needs 3:1) but just below AA for the 12.5px "Collapse" text. Use `#6b6b74` (about 4.9:1) for that text.
- **Theme mismatch**: shadcn's sidebar uses `--sidebar-accent` for both hover **and** active. The prototype uses different colours for the two (`#ebebeb` / `#e0f2ef`). Wire `--sidebar-hover` (extension) into the menu button's hover, or accept teal-tinted hover.

---

## 5. Components (Implemented)

### Buttons (`Button`)

| Variant | Rest | Hover | Notes |
|---|---|---|---|
| Primary | Background `#0f766e`, white text | Background `#115e59` | One per view or dialog |
| Secondary | White background, 1px `#e5e7eb` border, card shadow, text `#18181b` | Background `#f4f4f5` | Default variant |
| Ghost | Transparent, text `#52525b` | `rgba(0,0,0,.05)` fill, text `#18181b` | Row actions such as "Edit access" |
| Danger | White background, 1px `#f2b1aa` border, text `#b42318` | Background `#fde8e6` | Destructive confirm buttons (Deactivate, Remove…). Never a solid red fill. |

- **Sizes**:
  - sm: **28px** high, 8.75px horizontal padding, 12.5px/500, 14px icon.
  - md: **30px** high, 10.5px horizontal padding, 13px/500, 16px icon.
  - Icon and text are separated by a 5.25px gap. Radius is 6px.
- **IconButton**: 28×28, ghost style. It always has an `aria-label`.
- **Disabled**: 50% opacity with a `not-allowed` cursor (IconButton uses 40%). A disabled action whose reason isn't obvious gets a `title` explaining it, for example "In use by N user(s)".

### Inputs and selects

- **Text input** (`inputCls`):
  - 28px high, 1px `#d4d4d8` border, radius 6px, white background, 7px horizontal padding, 13px text;
  - placeholder `#6b6b74`.
- **Search**: same as a text input, plus a 14px search icon inset with 24.5px left padding. It uses `type="search"` and a visually hidden label.
- **Select**: native `<select>` with the same box as the text input (28px in forms; 30px for the toolbar `Select`).
- **Checkbox**: native, 14px, `accent-color: #0f766e`, label 13px with a 7px gap.
- **Field** (`Field`):
  - label above the control, 12.5px/500 `#52525b`, 3.5px gap;
  - hint below, 12px `#6b6b74`;
  - the error replaces the hint, 12px/500 `#b42318`;
  - the label is linked with `htmlFor`; the error or hint is linked with `aria-describedby`.
- **Fieldset groups** (vendor scope, permissions) use a `<legend>` styled like a label.

### Tables

- Built from `th`, `td` and `tdNum` with `border-separate` and `border-spacing: 0`.
- **Header**: sticky, background `#f4f4f5`, 12px/500 `#52525b`, padding 6px × 10px. There are no sortable headers in these modules.
- **Cell**: 12.5px `#18181b`, padding 5px × 10px, 1px bottom border `#e5e7eb`. Numbers are right-aligned with tabular numerals.
- **Row hover**: `rgba(244,244,245,.6)`.
- **Wrapper**: the table sits flush inside a Card (`bodyClass="p-0"`) with horizontal scroll (`.scroll-thin` scrollbar).
- **Pagination**: `Pager` at 25 rows per page.

### Badges

- 22px high, radius 4px, 5.25px horizontal padding, 12px/500. Soft tone fill with tone text and an optional 12px leading icon.
- Tones: ok / warn / bad / info / none / accent.
- `StatusText` is the quieter form: icon plus coloured text, no fill. Prefer it inside dense tables. Reserve filled badges for states that need attention (High severity, Invited, Deactivated, Built-in).

### Tabs and segmented control

- **Tabs**:
  - 13px/500, 2px bottom border;
  - active is a teal border with `#115e59` text; inactive is `#52525b` with a hover to `#18181b`;
  - count pill `#f4f4f5`, 12px;
  - `role="tablist"` / `tab` with `aria-selected`.
- **Segmented control**: a muted track; the active segment is white with `#115e59` text and a 1px `rgba(15,118,110,.4)` ring.

### Dialogs (`Modal`)

- Centred. Overlay `rgba(0,0,0,.30)`. Panel white, radius 7px, modal shadow, default max width 480px (confirm 440px, wide forms 560–640px), at most 90vh with internal scroll.
- Header: 14px × 10.5px padding, 14px/600 title, a close IconButton, bottom border.
- Body: 14px padding.
- Footer: right-aligned, 7px gap, **Cancel before the primary or danger action**, top border.
- **Escape** and an overlay click close the dialog. `role="dialog"` and `aria-modal`.
- **Confirmation dialog** (`ConfirmDialog`):
  - the title is a question ("Deactivate user?");
  - the body names the exact object and consequence;
  - a fixed demo note follows;
  - **Cancel has initial focus**;
  - the confirm button repeats the verb ("Remove relationship").
- **Form dialogs** (`FormModal`):
  - the primary button submits the `<form>` via the `form` attribute;
  - validation runs on submit and errors show inline.

### Drawers (`Drawer`)

- Slides from the right. Overlay `rgba(0,0,0,.25)`. Width 520px by default, full height, modal shadow.
- Header, scrollable body, Escape to close. Focus moves to the panel when it opens.

### Other

- **Card**: white, 1px `#e5e7eb` border, radius 8px, card shadow. Header has a 14px/600 title, a 12px `#6b6b74` subtitle and optional right-aligned actions.
- **Callout**: soft tone fill, 1px tone-line border, radius 8px, 16px icon and title. Used for simulation and assumption notices.
- **EmptyState**: centred 22px muted icon, 14px/600 title and one line of guidance. When filtering empties a table, the title says "No X match" and the guidance says how to clear the filter.
- **Page filters** (`LocalFilters`): dashed `#e5e7eb` border on `rgba(244,244,245,.6)`, labelled "Page filters".

---

## 6. States

| State | Implemented treatment |
|---|---|
| Hover | Neutral fill only (`#f4f4f5`, `rgba(0,0,0,.05)` or `#ebebeb` in the sidebar). Primary darkens to `#115e59`. No colour shift on fields. |
| Focus | `:focus-visible` gives a **2px solid `#0f766e` outline, 2px offset**, everywhere. Sidebar items use a −2px offset. No focus ring on mouse click. |
| Disabled | 50% opacity and `cursor: not-allowed`; disabled inputs get a `#f4f4f5` fill. Disabled persona options add text such as "(no admin access)". |
| Error / invalid | `aria-invalid="true"` gives a `#b42318` field border plus a 12px/500 red message below, linked by `aria-describedby`. Errors are specific: "Enter a valid email address", "A user with this email already exists". |
| Validation timing | On submit. Fields keep their values, and the dialog stays open until the form is valid. |
| Read-only (permission) | Add, edit and remove controls are **not rendered**, rather than disabled. A grey "Read-only for this persona" badge with a lock icon sits in the page header. One exception: on the Permission groups tab the permission checkboxes stay visible but disabled, so the matrix is still readable. |
| Blocked route | "Not available for this demo persona" with the note "(Prototype simulation – not production security.)" |

**Proposed**:
- Field border `#d4d4d8` is 1.48:1 on white, which is below SC 1.4.11 (3:1) for identifying a component boundary. The label and the 28px height carry the affordance in the prototype.
- If strict 1.4.11 compliance is required, use `#8a8a93` or darker for field borders, or add a hover border.
- The developer theme made this trade-off on purpose with an even lighter hairline.

---

## 7. Density and contrast (Implemented)

- **Compact** is the default. **Comfortable** is a user setting (`<html data-density>`). Density changes spacing only, never data.

  | Variable | Compact | Comfortable |
  |---|---|---|
  | `--cell-py` | 5px | 8px |
  | `--cell-px` | 10px | 12px |
  | `--th-py` | 6px | 8px |
  | `--heat-h` | 28px | 32px |
  | `--row-h` | 38px | 46px |

- The production heatmap (`.pg`) is tighter in Compact: 12px names and values, 11px sub-labels, with a 24px minimum hit area kept through `::after`.
- These variables are **component CSS**. They are not in the theme file.
- **Contrast floor**: all text pairs measure ≥4.5:1 except the sidebar muted text (§4) and plan grey in charts (non-text, labelled).

---

## 8. Required font assets and integration

1. Place the Avenir files at `/fonts/avenir-regular.woff2` (400), `/fonts/avenir-medium.woff2` (500) and `/fonts/avenir-heavy.woff2` (600–900). They are **not** included in this handoff or in the prototype repo, so source them from GCPL's licensed set.
2. Copy `theme.gcpl.css` over the existing tenant theme, next to `base.css` (the file imports `./base.css`).
3. Remove the prototype's Google Fonts Inter import if you port any prototype CSS. Avenir should be the only face.
4. Remap the prototype's Tailwind class names to your shadcn utilities:

   | Prototype | Your variable |
   |---|---|
   | `bg-surface` | `--background` |
   | `text-ink` | `--foreground` |
   | `text-ink-muted` | `--muted-foreground` |
   | `border-line` | `--border` |
   | `bg-accent` | `--primary` |
   | `bg-ok-soft` | `--success-subtle` |
   | (others) | follow the same pattern |

5. Decide the **root font size**:
   - At 16px, rem-based spacing renders about 14% larger than the prototype. Either accept it, or use the px targets in this document for controls (28/30px heights) and table padding.
6. Verify, in your app: focus ring rendering (`--ring` / `--ring-contrast` in base.css), radius derivation (`--radius` to sm/md/lg), sidebar hover versus active, and badge and table density at Avenir metrics.

---

## 9. Theme mapping: changes and mismatches

| Variable | Was | Now | Note |
|---|---|---|---|
| `--canvas` | `#faf9f8` | `#fafafa` | Neutral, not warm |
| `--foreground` (+ card/popover) | `#0a0a0a` | `#18181b` | |
| `--primary` | `#000000` | `#0f766e` | The prototype's primary action is teal. **Black buttons no longer exist.** |
| `--secondary`, `--muted`, `--accent` | `var(--canvas)` | `#f4f4f5` | Distinct from canvas so table headers and hovers read on canvas |
| `--muted-foreground` | `#6b7280` | `#52525b` | Prototype label/header grey. Hints use the `--subtle-foreground` extension. |
| `--accent-subtle` | `#e8fbfb` | `#e0f2ef` | |
| `--border` | `#e5e8eb` | `#e5e7eb` | |
| `--input`, `--border-secondary` | `#e5e8eb` / `#d3d8dd` | `#d4d4d8` | Fields are stronger than the old hairline |
| `--ring`, `--ring-contrast` | `#61e3e3` / `#0d8b8b` | `#0f766e` | No glow; a solid outline. **Depends on base.css.** |
| `--chart-1..4` | brand palette | prototype series | `--chart-5` unchanged |
| `--sidebar*` | black | grey `#f5f5f5` | Active `#e0f2ef` / `#115e59`. Hover needs the extension. |
| `--radius` | `.375rem` | `6px` | Same value at a 16px root; fixed so a 14px root doesn't shrink it |
| shadows | multi-layer | prototype card / pop / modal | `--shadow-card` is flatter |
| Semantic colours | — | **unchanged** | Prototype values listed in §1.3 |
| `--control-border`, `--font-*`, `--spacing`, `--tracking-normal` | — | unchanged | |

**Not representable in the theme (they live in component or base CSS)**:
- the 14px root;
- density variables;
- the `.pg` heatmap overrides;
- hatch and dot patterns;
- `.scroll-thin`;
- tabular numerals;
- the 3px active nav bar;
- the badge 4px radius;
- the dialog overlay opacity.

---

## 10. Implemented vs proposed (summary)

| Item | Status |
|---|---|
| All tokens and components in §1–7 | **Implemented** in the prototype |
| Theme mapping to the developer variables | **Implemented in `theme.gcpl.css`, not verified against base.css** |
| Avenir in place of Inter | **Proposed** (theme only; the prototype still renders Inter) |
| Sidebar muted text `#6b6b74` for AA | **Proposed** |
| Stronger field border for SC 1.4.11 | **Proposed** (optional) |
| Prototype semantic values instead of the developer values | **Proposed** (optional) |
| Focus trap in Modal (Drawer focuses the panel, Modal relies on autofocus) | **Proposed** |
| `--sidebar-hover` wired into the shadcn sidebar | **Proposed** |
