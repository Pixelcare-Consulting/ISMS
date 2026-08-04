/**
 * Release history for in-app "What's New" and update logs.
 *
 * Maintenance (each release):
 * 1. Bump `version` in package.json (semver: major.minor.patch)
 * 2. Prepend a new entry below with matching version, date, and highlights
 *    — Same calendar day: consolidate into the latest version (do not stack patches)
 * 3. Deploy — login footer and What's new dialog update automatically
 *
 * Writing style (always):
 * - Write for end users, not developers
 * - Describe what they can do or what feels better — not file names, SQL, slugs, or reseed steps
 * - Avoid jargon (RBAC, FK, hydration, pool timeout, GROUP BY, etc.)
 */

export type ReleaseChangeType = "feature" | "fix" | "improvement";

export interface ReleaseChange {
  type: ReleaseChangeType;
  description: string;
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  highlights: string[];
  changes?: ReleaseChange[];
}

export const RELEASES: ReleaseNote[] = [
  {
    version: "0.13.25",
    date: "2026-08-04",
    title: "Sales encode, ATR status, and smoother orders",
    highlights: [
      "Customize Sales & ATR return badge names and colors in Status settings",
      "Sales list shows one row per serial with clear status badges (including TO FOLLOW)",
      "Review multiple sale proofs in a preview window — images and PDFs side by side",
      "Attach multiple proof files on a sale and type the transaction number from your invoice",
      "Sales encode and returns are reliable again — TO FOLLOW saves, model price fills from the price list, and return status shows Pending CS",
      "Orders and Logistics only show actions for your step; View details is always available",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Settings → Status includes a Sales & ATR group to rename and recolor return and ATR badges",
      },
      {
        type: "feature",
        description:
          "Sale Proof supports multiple photos or PDFs on one transaction",
      },
      {
        type: "feature",
        description:
          "Sales and Orders lists include View details for the full transaction or approval history",
      },
      {
        type: "improvement",
        description:
          "Sale details opens proofs in a preview window with file list and next/previous — no need to leave the page",
      },
      {
        type: "improvement",
        description:
          "Sale details line table shows Status again (Sold, TO FOLLOW, return steps, and more)",
      },
      {
        type: "improvement",
        description:
          "Sales & ATR lists one row per serial; multi-unit sales share the same ID and transaction number",
      },
      {
        type: "improvement",
        description:
          "Sales return and ATR badges use names and colors from Status settings",
      },
      {
        type: "improvement",
        description:
          "New sales lets you type the transaction number from your invoice",
      },
      {
        type: "improvement",
        description:
          "Sale details uses a clearer layout with return actions at the bottom and proof review from attachments",
      },
      {
        type: "improvement",
        description:
          "Orders and Logistics row actions only show when it is your step",
      },
      {
        type: "improvement",
        description:
          "New orders stay limited to branches in your area so they show up in your list right away",
      },
      {
        type: "fix",
        description:
          "Serial number activity logs open again when viewing sold items",
      },
      {
        type: "fix",
        description:
          "Saving a sale with TO FOLLOW no longer fails",
      },
      {
        type: "fix",
        description:
          "Branch stock source lists area locations with sellable stock, and serials come from that stock",
      },
      {
        type: "fix",
        description:
          "Model price fills from the price list when you pick a model",
      },
      {
        type: "fix",
        description:
          "After a return is requested, Sales list status shows Pending CS instead of staying on TO FOLLOW",
      },
      {
        type: "fix",
        description:
          "Request return works again and asks for a return reason",
      },
      {
        type: "fix",
        description:
          "Sales proof attachments save and open correctly",
      },
      {
        type: "fix",
        description:
          "Accept delivery on Logistics works again for pending order deliveries",
      },
      {
        type: "fix",
        description:
          "Dashboard activity cards and Product Specialist order approvals work reliably again",
      },
    ],
  },

  {
    version: "0.13.23",
    date: "2026-08-03",
    title: "Smoother sales, clearer roles, and a cleaner dashboard screen",
    highlights: [
      "Help & Support How ISMS works Improved with Workflow Guide — solid step cards, a tidy process tab bar, numbered steps with no sideways scroll, and vertical role timelines",
      "More Dashboard summaries: Planning & alerts for extra ops signals, plus a This month snapshot (orders, sales, in transit) with icons",
      "Module guides on busy pages — short collapsible tips under the header (Inventory, Sales, Orders, Logistics, Roles, Planning, Planogram, AORs, and more)",
      "Sign-in has been optimized to load faster",
      "Browser tabs show friendly page names (for example, Stock units)",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Help & Support How ISMS works: solid step cards and process chips, numbered steps, and vertical role timelines",
      },
      {
        type: "feature",
        description:
          "Compliance home shows Policies, Reports, Announcements, and Competitors when available",
      },
      {
        type: "feature",
        description:
          "New sales shows the transaction number up front and saves it with the sale",
      },
      {
        type: "feature",
        description:
          "Sale details support packages, brand, promo, stock-source branch, and proof upload",
      },
      {
        type: "feature",
        description:
          "Click a serial cell with +N to see every serial on that sale",
      },
      {
        type: "feature",
        description:
          "Role settings can turn ATR request, evaluate, approve, and restore on or off per role",
      },
      {
        type: "feature",
        description:
          "Logistics and settings can grant view-only access separately from manage",
      },
      {
        type: "feature",
        description:
          "Status settings let you choose badge colors; each tab explains which module uses those codes",
      },
      {
        type: "feature",
        description:
          "Busy pages show a collapsible module guide under the header so you can skim how the screen works",
      },
      {
        type: "improvement",
        description:
          "Sales & ATRs return actions (request, evaluate, approve, reject, restore) ask for confirmation before running",
      },
      {
        type: "improvement",
        description:
          "Dashboard screen adds Planning & alerts and a This month snapshot alongside inventory and the order pipeline",
      },
      {
        type: "improvement",
        description:
          "Inventory summary shows status counts beside the chart; This month sits beside Order pipeline",
      },
      {
        type: "improvement",
        description:
          "This month snapshot uses icons and clearer rows for orders, sales, and in transit",
      },
      {
        type: "improvement",
        description:
          "Activity cards share rows evenly so the dashboard layout stays tidy for every role",
      },
      {
        type: "improvement",
        description:
          "Removed duplicate Ops snapshot tiles so numbers appear once in the activity cards",
      },
      {
        type: "improvement",
        description:
          "Roles matrix and access drawer are searchable and easier on mobile",
      },
      {
        type: "improvement",
        description:
          "Stock units Series summary starts collapsed; click the header to expand or hide (choice remembered)",
      },
      {
        type: "improvement",
        description:
          "Inventory quick guide covers off planogram and Branch / Model / Serial / DR / Planogram / Aging / Status columns",
      },
    
      {
        type: "improvement",
        description:
          "Sales & ATRs list uses clear status badges and consistent serial / amount formatting",
      },
      {
        type: "improvement",
        description:
          "Series summary includes a searchable View series dialog with sticky totals",
      },
      {
        type: "improvement",
        description:
          "Planning and Suggested orders use clearer action buttons and soft status badges on draft orders",
      },
      {
        type: "improvement",
        description:
          "Sign-in loading is quieter; report page titles match the sidebar",
      },
      {
        type: "fix",
        description:
          "Stock status donut hover shows the slice you point at, not a conflicting total tip",
      },
      {
        type: "fix",
        description:
          "Inventory and off-planogram views are more stable under heavy lists",
      },
      {
        type: "fix",
        description:
          "Restore stock on returns works for one or many serials, and shows a clear message if a sale has no serials left to restore",
      },
      {
        type: "fix",
        description:
          "Serial activity log no longer fails when an old sold serial is missing",
      },
      {
        type: "fix",
        description:
          "Transfers confirm dialog no longer flashes an error when listing serials",
      },
      {
        type: "fix",
        description:
          "Confirmation dialogs stay readable without browser accessibility console spam",
      },
    ],
  },

  {
    version: "0.13.11",
    date: "2026-07-31",
    title: "New sales encode and package details",
    highlights: [
      "Record a new sale from Sales with a clear header, details table, and Save / Back",
      "Add package details by quantity — each unit gets its own model, serial, and amount",
      "Multi-line sales update each serial’s stock status; use New transaction instead of the old inline form",
    ],
    changes: [
      {
        type: "feature",
        description:
          "New sales page with header, details table, and Save / Back",
      },
      {
        type: "feature",
        description:
          "Package detail modal expands quantity into separate model / serial / amount rows",
      },
      {
        type: "improvement",
        description:
          "Sales list keeps returns workflow; New transaction opens the full encode page",
      },
      {
        type: "fix",
        description:
          "Dialogs no longer show accessibility warnings in the browser console",
      },
    ],
  },
  {
    version: "0.13.9",
    date: "2026-07-30",
    title: "Branch schedule UX uses company ordering policy & Inventory serial details",
    highlights: [
      "Branch delivery schedule shows company locked weekdays and clearer global vs branch hierarchy",
      "Selecting a frequency code suggests delivery and ordering days (editable after)",
      "Disabling a branch schedule clears the saved BranchDeliverySchedule row",
      "BRANCH and MODEL on Inventory Stock units are plain text (no planogram links)",
      "Clicking a row, Branch, Model, or Serial opens serial details and history",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Branch create/edit schedule card surfaces company locked days, disables those weekdays on pickers, and links to Settings → Ordering policy when permitted",
      },
      {
        type: "feature",
        description:
          "Frequency code selection autofills delivery/order days from cadence + global locks (suggest-schedule-days helper)",
      },
      {
        type: "fix",
        description:
          "Updating a branch with schedule disabled deletes BranchDeliverySchedule so stale orderDays no longer gate create",
      },
      {
        type: "fix",
        description:
          "Inventory stock units BRANCH/MODEL no longer link to planogram; row click opens serial details",
      },
    ],
  },
  {
    version: "0.13.7",
    date: "2026-07-30",
    title: "PH regions/provinces seed + PSG branch",
    highlights: [
      "Seed Regions and Provinces for every tenant from the PH REGION→PROVINCE master list",
      "New db:seed:branches loads ~1k PSG ISMS branches (areas, status, Devant/Hisense quotas)",
      "Branches Import can create missing sap_codes and accepts PSG ISMS columns / sheet",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Idempotent geo seed (Region / Province) for all tenants on core, minimal, full, and branches profiles",
      },
      {
        type: "feature",
        description:
          "PSG workbook parser + upsert: BranchArea, Branch by sap_code, current-month quotas (Hisense BL+WL summed); pnpm run db:seed:branches",
      },
      {
        type: "improvement",
        description:
          "Branches Import creates unknown BRANCH CODEs, previews create vs update counts, accepts ISMS/PSG single-sheet uploads",
      },
    ],
  },
  {
    version: "0.13.6",
    date: "2026-07-30",
    title: "Orders split, Sales encode polish, Inventory Excel view",
    highlights: [
      "Orders split into Manual / Special / Auto replenish with per-type view, create, and approve permissions",
      "Sales encode: PS auto-branch, TL can create sales with branch picker, transactionNo on the table",
      "Stock units: series QTY/VALUE summary, DR# / DR date / aging, status filter, PS column scoping",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Orders nav group with /orders/manual, /orders/special, /orders/auto-replenish; permissions orders.manual|special|auto_replenish × view|create|approve (legacy orders.* still accepted)",
      }, 
      {
        type: "improvement",
        description:
          "Sales encode: PS resolves AOR branch automatically; TL seed includes sales.create and keeps multi-branch picker; table shows transactionNo",
      },
      {
        type: "feature",
        description:
          "Inventory Stock units: series peso summary (QTY/VALUE), DR#/DR date/aging from deliveries, status filter, PS hides branch column/search",
      },
    ],
  },
  {
    version: "0.13.5",
    date: "2026-07-30",
    title: "Reports export form shown immediately",
    highlights: [
      "Processed Orders and Daily Stock reports show the CSV export form on load — no Load branches step",
      "Branch dropdown still loads in the background and defaults to All branches",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Reports: auto-load branches on mount and display Processed from/to, Branch, and Download CSV without a gate button",
      },
    ],
  },
  {
    version: "0.13.4",
    date: "2026-07-30",
    title: "Competitor brand and model masters",
    highlights: [
      "Competitor observations use dedicated CompetitorBrand / CompetitorModel masters (not inventory Brand/SKU)",
      "Master data: Competitor brands page with nested models (name + active status)",
      "Existing observation brand/model links migrated into the new tables with name snapshots",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Tenant-scoped CompetitorBrand and CompetitorModel lookups under Sales master data",
      },
      {
        type: "improvement",
        description:
          "Observation form and table pick competitor brands/models only; promotion stays free text",
      },
      {
        type: "fix",
        description:
          "Detached competitor observations from inventory Brand / ProductModel foreign keys",
      },
    ],
  },
  {
    version: "0.13.3",
    date: "2026-07-28",
    title: "AOR sync, Sales nav, Competitors master",
    highlights: [
      "AOR assign form hydrates existing branch/dealer/warehouse selections and syncs add/remove on submit",
      "Sales encode (`/sales`) and Sales report (`/reports/sales`) re-enabled in the sidebar",
      "Competitors: master lookup dropdown, AOR-bound branch on write, optional promotion field",
    ],
    changes: [
      {
        type: "fix",
        description:
          "AOR assign pre-selects the user’s current AORs and syncs create/delete instead of append-only re-pick",
      },
      {
        type: "improvement",
        description:
          "Sales and Sales report nav links restored for users with sales.create / reports access",
      },
      {
        type: "feature",
        description:
          "Competitor master data lookup; observations pick competitor + promotion; branch set from exactly one AOR branch",
      },
    ],
  },
  {
    version: "0.13.2",
    date: "2026-07-28",
    title: "SAP Service Layer session status UI",
    highlights: [
      "Session status strip on Service Layer settings: Connected / Idle with masked session id and countdown",
      "Connect and Logout establish or clear the in-process B1 session (separate from Test connection)",
      "Test connection remains a probe (login → logout) and does not leave a cached session",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Service Layer settings show live session status with Connect/Logout against the enabled company DB",
      },
      {
        type: "improvement",
        description:
          "Public session status masks session id (last 4 only); never exposes cookies",
      },
    ],
  },
  {
    version: "0.13.1",
    date: "2026-07-28",
    title: "SAP Service Layer session client",
    highlights: [
      "In-process B1 session cache with TTL and automatic re-login on 401",
      "Shared Service Layer HTTP client ready for future live document transport",
      "Connection test and config updates invalidate stale sessions",
    ],
    changes: [
      {
        type: "feature",
        description:
          "SAP Service Layer client: cookie session reuse, proactive TTL refresh, single retry after Invalid session / 401",
      },
      {
        type: "improvement",
        description:
          "Service Layer connection test uses login/logout via the shared client; sessions cleared on config mutate/disable/delete",
      },
    ],
  },
  {
    version: "0.13.0",
    date: "2026-07-23",
    title: "Branch quotas, Official Sales, and order dealer cascade",
    highlights: [
      "Alternate fulfillment picks other branches; Branch Quotas enforce monthly brand limits on create",
      "Official Sales under Reports — upload Excel/CSV, stage rows, process SALE/RETURN on serials",
      "Create order: pick dealer first, then that dealer’s active branches; package type qty on price list cards",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Alternate warehouses on branches now multi-select other active branches (not warehouse records)",
      },
      {
        type: "improvement",
        description:
          "Dealer dropdowns for branches, AORs, and orders only list active dealers",
      },
      {
        type: "feature",
        description:
          "Branch Quotas settings (Sheet CRUD) with monthly quota enforcement when creating branch orders",
      },
      {
        type: "feature",
        description:
          "Official Sales report: Excel/CSV staging table, clear temp, process STK→SLD sale or SLD/RSV→STK return",
      },
      {
        type: "feature",
        description:
          "Create branch order loads dealers and branches automatically; branch list filters by selected dealer",
      },
      {
        type: "feature",
        description:
          "Package types include quantity; price list cards show name · qty on the package badge",
      },
    ],
  },
  {
    version: "0.12.1",
    date: "2026-07-12",
    title: "New Settings modules, searchable lists, and clearer access",
    highlights: [
      "Look for the green NEW labels in the sidebar on Dealers, Service centers, Departments, Warehouses, and more",
      "Dealers, Service centers, Price lists, SAP, and Audit Logs — easier to find and control who can use them",
      "Type-to-search on dropdowns; Settings stays open by default; quicker sign-in and page guides",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Green NEW badges in the menu mark Dealers, Service centers, Departments, Warehouses, SAP, Audit Logs, Roles, Branches, Planogram, Master data, AORs, Announcements, Competitors, and P-Count",
      },
      {
        type: "feature",
        description:
          "Dealers — manage dealer records from Settings; Search + Add opens a right-side form",
      },
      {
        type: "feature",
        description:
          "Service centers — manage service centers from Settings; Search + Add opens a right-side form",
      },
      {
        type: "feature",
        description:
          "Price lists — its own Master data area with add and history in side panels, plus model cards with period history",
      },
      {
        type: "feature",
        description:
          "You can grant access separately for Departments, Dealers, Service centers, Warehouses, SAP integration, and Audit Logs",
      },
      {
        type: "feature",
        description:
          "Audit Logs (system and serial number logs) in the sidebar when you have Audit Logs access",
      },
      {
        type: "feature",
        description:
          "Most dropdowns let you type to find an option (branches, warehouses, roles, filters, and more)",
      },
      {
        type: "feature",
        description:
          "When adding a permission, search modules by name and scroll the list smoothly",
      },
      {
        type: "feature",
        description:
          "Quick guides on many pages can open once on first visit; use the ? button anytime to reopen them",
      },
      {
        type: "feature",
        description:
          "Search boxes in tables suggest matching rows from what is already on the page",
      },
      {
        type: "improvement",
        description:
          "Settings in the left menu starts expanded so Dealers, Service centers, Warehouses, and the rest are easier to reach",
      },
      {
        type: "improvement",
        description:
          "On Models and Brands/Categories, Search + Add also opens a right-side form panel",
      },
      {
        type: "improvement",
        description:
          "When adding or editing a user, show or hide the password with the eye icon (same as sign-in)",
      },
      {
        type: "improvement",
        description:
          "Sign-in keep a loading screen until the dashboard opens",
      },
      {
        type: "improvement",
        description:
          "Small polish: closer page titles, clearer close and Done actions, and dropdowns that look ready to use",
      },
      {
        type: "fix",
        description:
          "Audit Logs (including serial number logs) shows correctly again when you have Audit Logs access",
      },
    ],
  },
  {
    version: "0.12.0",
    date: "2026-07-11",
    title: "Announcements, Competitors, P-Count, and Settings upgrades",
    highlights: [
      "New: Announcements (with dashboard banner) and Competitors for market price notes",
      "P-Count stock count history and Reports → P-Count; friendlier Roles and bulk AOR assign",
      "Settings polish for Branches, Planogram, Master data, and AORs; header shows version · date",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Announcements — create and manage posts, with an active banner on the dashboard",
      },
      {
        type: "feature",
        description:
          "Competitors — record and review market price observations",
      },
      {
        type: "feature",
        description:
          "P-Count — keep stock-count history when you close a count; open Reports → P-Count for a summary",
      },
      {
        type: "feature",
        description:
          "Roles — easier setup with cards and grouped permissions; advanced matrix still available if you need it",
      },
      {
        type: "feature",
        description:
          "AORs — assign many branches or dealers at once; table grouped by user; searchable pickers",
      },
      {
        type: "feature",
        description:
          "Settings areas for Branches, Planogram, and Master data are easier to work with day to day",
      },
      {
        type: "improvement",
        description:
          "Header shows the current version and date next to What’s new; New badges and sidebar polish",
      },
      {
        type: "fix",
        description:
          "Removed a duplicate P-Count link under Inventory",
      },
    ],
  },
  {
    version: "0.11.40",
    date: "2026-06-02",
    title: "Faster updates on more Settings tables",
    highlights: [
      "Warehouses, status settings, and master data update in the table as soon as you save",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Create and edit on warehouses, status codes, and master data now show in the table right away",
      },
    ],
  },
  {
    version: "0.11.39",
    date: "2026-06-02",
    title: "Page quick guides",
    highlights: [
      "Page titles can show a ? button that opens a short guided walkthrough",
      "Branch orders includes guidance on order types and review steps",
    ],
    changes: [
      {
        type: "feature",
        description:
          "You can open a short tutorial from the page header ? button",
      },
      {
        type: "improvement",
        description:
          "Branch orders guide covers order types, review steps, and a link to Help",
      },
    ],
  },
  {
    version: "0.11.38",
    date: "2026-06-02",
    title: "Clearer order review actions",
    highlights: [
      "A loading screen appears while approve or reject is saving",
      "Review stays disabled with a short tip when it is not your turn to approve",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Approving or rejecting an order shows a loading screen until it finishes",
      },
      {
        type: "improvement",
        description:
          "Review is disabled with a tip when you are not the designated approver",
      },
      {
        type: "fix",
        description:
          "The “not your turn” tip no longer leaves a wide empty gap",
      },
    ],
  },
  {
    version: "0.11.37",
    date: "2026-06-02",
    title: "Help portal and loading bar polish",
    highlights: [
      "Top loading bar spans the full width without a dark shadow under the header",
      "Help page: sticky quick actions, essential links, and a larger FAQ",
    ],
    changes: [
      {
        type: "fix",
        description:
          "Top loading bar no longer shows a dark glow under the header",
      },
      {
        type: "improvement",
        description:
          "Help & Support focuses on quick actions, clearer headers, and more FAQ topics",
      },
    ],
  },
  {
    version: "0.11.36",
    date: "2026-06-02",
    title: "Richer Help & Support content",
    highlights: [
      "Help & Support uses a two-column layout with quick actions on the right",
      "Added a system overview and more workflow guides across major modules",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Help portal adds module navigation tips, more workflow guides, and grouped quick-action links",
      },
    ],
  },
  {
    version: "0.11.35",
    date: "2026-06-02",
    title: "Cleaner top loading bar",
    highlights: [
      "Removed the dark strip that appeared under the header while pages loaded",
    ],
    changes: [
      {
        type: "fix",
        description:
          "Top loading indicator no longer casts a dark shadow under the navigation",
      },
    ],
  },
  {
    version: "0.11.34",
    date: "2026-06-02",
    title: "Simpler Help & Support layout",
    highlights: [
      "Help portal is a single scrolling page instead of tabs",
      "Jump links and clearer sections make answers easier to find",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Help & Support uses anchored sections for quick actions, guides, FAQ, and contact",
      },
    ],
  },
  {
    version: "0.11.33",
    date: "2026-06-02",
    title: "Help & Support portal",
    highlights: [
      "User menu includes Help & Support for an in-app support page",
      "FAQ, workflow guides, quick links, and contact options in one place",
    ],
    changes: [
      {
        type: "feature",
        description:
          "New Help & Support page with overview, workflows, FAQ, and contact",
      },
      {
        type: "improvement",
        description:
          "Help & Support is available from the header and sidebar user menus",
      },
    ],
  },
  {
    version: "0.11.32",
    date: "2026-06-02",
    title: "Row selection on remaining tables",
    highlights: [
      "Permissions, roles matrix, planning gaps, planogram, and stock-count detail tables support row checkboxes",
      "Major tables now share the same index and select-all behavior",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Finished rolling out consistent row selection across remaining feature and detail tables",
      },
    ],
  },
  {
    version: "0.11.31",
    date: "2026-06-02",
    title: "Selection on ops and policy tables",
    highlights: [
      "Deliveries, transfers, and pull-outs tables include index and checkboxes",
      "Policy version history supports select-all",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Row selection extended to operations tables and policy version history",
      },
    ],
  },
  {
    version: "0.11.30",
    date: "2026-06-02",
    title: "Selection on more app tables",
    highlights: [
      "Policies, dashboard users, stock-count sessions, and SAP config tables support checkboxes",
      "Select-all works the same way across these lists",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Shared row selection pattern expanded to more modules for bulk actions later",
      },
    ],
  },
  {
    version: "0.11.29",
    date: "2026-06-02",
    title: "Selection on Settings and admin tables",
    highlights: [
      "Settings tables include index and checkbox columns with select-all",
      "Toolbars show how many rows are selected and let you clear the selection",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Branches, departments, warehouses, users, planning, and other admin tables support row selection",
      },
    ],
  },
  {
    version: "0.11.28",
    date: "2026-06-02",
    title: "Selection on operational tables",
    highlights: [
      "Orders, sales, logistics, and inventory tables include an index and checkboxes",
      "You can see how many rows are selected and clear the selection",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Operational tables use a consistent index-plus-checkbox selection pattern",
      },
    ],
  },
  {
    version: "0.11.27",
    date: "2026-06-02",
    title: "In-app confirms for order actions",
    highlights: [
      "Approve and Reject use an in-app confirmation instead of the browser’s built-in prompt",
      "Reject still requires a comment; buttons stay locked while saving",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Order approve and reject use a styled confirmation dialog inside the app",
      },
    ],
  },
  {
    version: "0.11.26",
    date: "2026-06-02",
    title: "Safer order approve and reject",
    highlights: [
      "Approve and Reject ask you to confirm before submitting",
      "Reject requires a comment; comment field has more room so it is not clipped",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Order review asks for confirmation, requires a reject comment, and gives the comment field more space",
      },
    ],
  },
  {
    version: "0.11.25",
    date: "2026-06-02",
    title: "Roomier order review layout",
    highlights: [
      "Order lines get more width for easier scanning",
      "Details and comments scroll on their own so the comment field is not cut off",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Order review gives lines more space and scrolls the details pane separately",
      },
    ],
  },
  {
    version: "0.11.24",
    date: "2026-06-02",
    title: "Scrollable order lines table",
    highlights: [
      "Order lines show as a table with index, SKU, and quantity",
      "Lines scroll inside the panel while the rest of the review stays fixed",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Order review shows lines in a scrollable table for large orders",
      },
    ],
  },
  {
    version: "0.11.23",
    date: "2026-06-02",
    title: "Order status badges and line summary",
    highlights: [
      "Order review shows status as a color-coded badge",
      "Lines preview lists the top entries with totals for lines and quantity",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Order review adds a status badge, indexed line preview, and totals summary",
      },
    ],
  },
  {
    version: "0.11.22",
    date: "2026-06-02",
    title: "Two-column order review",
    highlights: [
      "Order lines sit in a right-side panel while details stay on the left",
      "Only the lines panel scrolls; Approve and Reject stay at the bottom",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Order review uses a two-column layout with fixed actions at the footer",
      },
    ],
  },
  {
    version: "0.11.21",
    date: "2026-06-02",
    title: "Live SAP connection test feedback",
    highlights: [
      "SAP Test connection shows a live progress feed with elapsed time and current step",
      "You get context when a test may take longer (network, security handshake, or SAP sign-in)",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "SAP connection test shows step-by-step status and how long it has been running",
      },
    ],
  },
  {
    version: "0.11.20",
    date: "2026-06-02",
    title: "Loading screen for SAP testing",
    highlights: [
      "A shared loading screen covers in-progress actions",
      "SAP Test connection shows that screen while credentials are checked",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "SAP Test connection uses a full loading screen instead of only a button spinner",
      },
    ],
  },
  {
    version: "0.11.19",
    date: "2026-06-02",
    title: "Consistent page header divider",
    highlights: [
      "Pages share the same divider line under the title area",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Page headers use a consistent bottom divider across the app",
      },
    ],
  },
  {
    version: "0.11.18",
    date: "2026-06-02",
    title: "More side breathing room",
    highlights: [
      "Slightly wider left and right padding so full-width pages feel less cramped",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "App pages gain a bit more horizontal padding on all screen sizes",
      },
    ],
  },
  {
    version: "0.11.17",
    date: "2026-06-02",
    title: "Full-width app layout",
    highlights: [
      "Pages can use the full screen width on wide monitors",
      "SAP integration and the dashboard expand across large screens",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "App content is no longer capped at a narrow max width",
      },
    ],
  },
  {
    version: "0.11.16",
    date: "2026-06-02",
    title: "Edit and delete SAP DB configs",
    highlights: [
      "Each SAP company database row supports Edit and Delete",
      "The form switches between Add and Update with a clear cancel path",
    ],
    changes: [
      {
        type: "feature",
        description:
          "SAP Service Layer settings let you update or delete saved company database configs",
      },
    ],
  },
  {
    version: "0.11.15",
    date: "2026-06-02",
    title: "Instant SAP DB table updates",
    highlights: [
      "The SAP DB table updates as soon as you add a config or toggle active/inactive",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "SAP Service Layer form shows table changes right away after save or status toggle",
      },
    ],
  },
  {
    version: "0.11.14",
    date: "2026-06-02",
    title: "Clearer loading spinners",
    highlights: [
      "Shared spinner-and-label loading states across the app",
      "SAP Service Layer shows separate loading for test, save, and status update",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Consistent loading indicator used on SAP Service Layer actions",
      },
    ],
  },
  {
    version: "0.11.13",
    date: "2026-06-02",
    title: "SAP self-signed certificate fallback",
    highlights: [
      "Test connection can retry when an on-prem SAP server uses a self-signed certificate",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "SAP connection test automatically retries for common on-prem certificate setups",
      },
    ],
  },
  {
    version: "0.11.12",
    date: "2026-06-02",
    title: "Unified SAP setup and connection test",
    highlights: [
      "Service Layer form and SAP DB table sit in one section",
      "Test connection checks login against SAP; inactive configs show in red",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "SAP integration shows config and database list together with clearer inactive status",
      },
      {
        type: "feature",
        description:
          "SAP Service Layer Test connection verifies credentials against SAP",
      },
    ],
  },
  {
    version: "0.11.11",
    date: "2026-06-02",
    title: "Multiple SAP company databases",
    highlights: [
      "Service Layer settings support more than one SAP company database per organization",
      "A table lists saved entries with Active / Inactive actions",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Manage multiple SAP Service Layer company databases and turn them on or off",
      },
    ],
  },
  {
    version: "0.11.10",
    date: "2026-06-02",
    title: "Faster updates on more Settings pages",
    highlights: [
      "Departments, branches, and AORs update in the table as soon as you save",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Create, edit, and delete on departments, branches, and AORs show in the table right away",
      },
    ],
  },
  {
    version: "0.11.9",
    date: "2026-06-02",
    title: "Faster user table updates",
    highlights: [
      "Users table updates as soon as you create, edit, or delete someone",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Users Settings shows row changes immediately after save",
      },
    ],
  },
  {
    version: "0.11.8",
    date: "2026-06-02",
    title: "Fewer duplicate section tabs",
    highlights: [
      "Inventory, Logistics, and Reports no longer show extra pill tabs when the same links are already in the top nav",
      "Master data and SAP integration keep in-page tabs where they are still useful",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Section pages skip redundant tabs when navigation already covers those destinations",
      },
    ],
  },
  {
    version: "0.11.7",
    date: "2026-06-02",
    title: "Shared data tables and clearer menus",
    highlights: [
      "Tables across the app share a consistent card-style layout",
      "Top navigation links show a hand cursor on hover",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Shared table layout used on planning and other list pages",
      },
      {
        type: "improvement",
        description:
          "Header menus and links feel clickable with a pointer cursor",
      },
    ],
  },
  {
    version: "0.11.6",
    date: "2026-06-02",
    title: "Master data tables and clickable buttons",
    highlights: [
      "Brands and models tables use the same card-style layout, including SRP on models",
      "Buttons show a hand cursor on hover across the app",
      "Models list no longer breaks when price amounts are shown",
    ],
    changes: [
      {
        type: "fix",
        description:
          "Models list displays prices correctly without a display error",
      },
      {
        type: "improvement",
        description:
          "Master data brands and models tables use a clearer card layout",
      },
      {
        type: "improvement",
        description:
          "Buttons look and feel clickable with a pointer cursor",
      },
    ],
  },
  {
    version: "0.11.5",
    date: "2026-06-02",
    title: "Clearer tabs and secondary buttons",
    highlights: [
      "Active section tabs use a solid teal fill so the selection is obvious",
      "Outline and secondary buttons have clearer borders so they read as clickable",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Active tabs stand out; inactive tabs show a hover state",
      },
      {
        type: "improvement",
        description:
          "Secondary and outline buttons have stronger borders and hover states",
      },
    ],
  },
  {
    version: "0.11.4",
    date: "2026-06-02",
    title: "Section tabs across major areas",
    highlights: [
      "Pill-style tabs for SAP integration, Logistics, Reports, Master data, and Inventory",
      "Each tab can show a short intro for that section",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Shared section tabs and intro copy for major module areas",
      },
      {
        type: "improvement",
        description:
          "Logistics, reports, master data, and inventory use the same tab chrome",
      },
    ],
  },
  {
    version: "0.11.3",
    date: "2026-06-02",
    title: "Encrypted SAP credentials",
    highlights: [
      "Service Layer URL, company database, username, and password are stored encrypted",
      "Audit logs keep fingerprints only — credentials stay out of log details",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "All SAP Service Layer credential fields are encrypted at rest; older plain values re-encrypt when you save",
      },
    ],
  },
  {
    version: "0.11.2",
    date: "2026-06-02",
    title: "SAP Service Layer settings",
    highlights: [
      "Settings → SAP integration → Service Layer to configure URL, company database, and credentials",
      "Credentials are stored encrypted per organization",
    ],
    changes: [
      {
        type: "feature",
        description:
          "SAP Service Layer setup form with encrypted password storage",
      },
      {
        type: "improvement",
        description:
          "SAP integration splits into Integration queue and Service Layer tabs",
      },
    ],
  },
  {
    version: "0.11.1",
    date: "2026-06-02",
    title: "Smarter delivery due dates on approval",
    highlights: [
      "At final approve, delivery due dates that fall outside the branch schedule move to the next scheduled day",
      "Review warns before approve; the audit trail keeps requested vs final due date",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Final order approval can auto-reschedule delivery due dates to the branch’s next delivery day",
      },
      {
        type: "improvement",
        description:
          "Documentation updated for shipped Phase 2–3 items",
      },
    ],
  },
  {
    version: "0.11.0",
    date: "2026-06-02",
    title: "Physical stock count and SAP foundation",
    highlights: [
      "Physical inventory counts: sessions from branch stock, scan, variance review, and SAP adjustment handoff",
      "SAP outbound queue foundation with references on orders, deliveries, and pull-outs",
      "Stock count and SAP integration screens with a full audit trail",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Stock count sessions, lines, and variance workflow for physical inventory audits",
      },
      {
        type: "feature",
        description:
          "SAP integration queue and first outbound job hooks for approved orders and related docs",
      },
      {
        type: "feature",
        description:
          "Approving an order can queue a SAP job; a mock path can set document refs and create deliveries",
      },
      {
        type: "improvement",
        description:
          "SAP integration docs list what is live versus still planned",
      },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-06-02",
    title: "Sales, logistics movement, returns, and warehouses",
    highlights: [
      "Sales serial picker (your branches), reserved sales, and sales CSV export",
      "Transfers and pull-outs move inventory through their lifecycle",
      "Branch return workflow with evaluate and approve steps",
      "Settings → Warehouses for warehouse and location setup",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Sales serial picker, reserved sale, and branch return (ATR) workflow",
      },
      {
        type: "feature",
        description:
          "Sales report CSV with transaction, serial, and return status",
      },
      {
        type: "feature",
        description:
          "Logistics transfer and pull-out serial movement, with optional per-serial delivery accept",
      },
      {
        type: "feature",
        description:
          "Warehouses Settings for creating and managing warehouses and locations",
      },
    ],
  },
  {
    version: "0.9.8",
    date: "2026-06-02",
    title: "Planning upload, reject delivery, and process-flow polish",
    highlights: [
      "Planning: Upload forecast CSV is visible on the planning panel",
      "Logistics: reject pending deliveries from deliveries and operations",
      "Orders: due-date warning at approve; auto-replenish links to suggested orders",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Upload forecast CSV button on Settings → Planning",
      },
      {
        type: "feature",
        description:
          "Reject delivery action on Logistics deliveries and Operations",
      },
      {
        type: "improvement",
        description:
          "SP approve warns when the delivery due date is outside the branch window; create order links to suggested orders",
      },
      {
        type: "improvement",
        description:
          "Process-flow and SAP scope documentation updated",
      },
    ],
  },
  {
    version: "0.9.7",
    date: "2026-06-01",
    title: "Processed orders report and sales order numbers",
    highlights: [
      "Processed Order Summary CSV with approved qty, remarks, CBM, and geography",
      "Sales order numbers use SO# yearly-month sequence; approval records processed time and approved qty",
      "Daily stock and transfer CSV reports; supply planning roles added",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Reports for processed orders, daily stock, and transfers as CSV downloads",
      },
      {
        type: "feature",
        description:
          "Orders get SO# numbers, approved quantities per line, SPA remarks, and delivery due date",
      },
      {
        type: "improvement",
        description:
          "New supply planning and SPA roles aligned with the order workflow",
      },
      {
        type: "improvement",
        description:
          "Docs updated for workflow traceability and SAP MVP scope",
      },
    ],
  },
  {
    version: "0.9.6",
    date: "2026-06-01",
    title: "Planning tables with filters and pages",
    highlights: [
      "Allocation gaps paginate and can filter by branch or search by name / SKU",
      "Draft suggested orders support branch filter, search, and pagination",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Planning allocation gaps support paging and branch/SKU filters",
      },
      {
        type: "improvement",
        description:
          "Suggested orders drafts and open gaps each have their own filters and pages",
      },
    ],
  },
  {
    version: "0.9.5",
    date: "2026-06-01",
    title: "Full planning pipeline",
    highlights: [
      "Settings → Planning: branch revenue targets, run allocation, and generate auto-replenish drafts",
      "Planogram import with Series/SRP columns and stock breakdown links",
      "Inventory planogram badges and off-planogram filter",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Forecast targets and allocation gaps based on planogram max versus on-hand stock",
      },
      {
        type: "feature",
        description:
          "Suggested orders can create auto-replenish drafts ready for TL → SP approval",
      },
      {
        type: "fix",
        description:
          "Planning page displays amounts and dates without a display error",
      },
    ],
  },
  {
    version: "0.9.4",
    date: "2026-06-01",
    title: "Planogram demo data and clearer order dialogs",
    highlights: [
      "Demo seed aligns brands, SKUs, and shelf targets with the BRS planogram sample",
      "Order review and create dialogs show workflow hints and remaining shelf capacity",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Demo data includes planogram targets, more SKUs, and an extra sample branch",
      },
      {
        type: "improvement",
        description:
          "Order review shows type, branch, lines, status, and next approver",
      },
      {
        type: "improvement",
        description:
          "Create order shows remaining shelf capacity; auto-replenish marked coming soon",
      },
    ],
  },
  {
    version: "0.9.3",
    date: "2026-06-01",
    title: "Clearer audit log and list badges",
    highlights: [
      "Audit entries show branch names, document numbers, and line summaries",
      "Colored badges for orders, deliveries, transfers, pull-outs, and sales",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Audit log formats order, logistics, and sales events in plain language",
      },
      {
        type: "improvement",
        description:
          "Audit details include branch names and document numbers when available",
      },
      {
        type: "fix",
        description:
          "Inventory status update label displays correctly in the audit log",
      },
      {
        type: "improvement",
        description:
          "Orders and logistics lists share search toolbars and colored status badges",
      },
      {
        type: "fix",
        description:
          "Navigation loading bar no longer covers header dropdown menus",
      },
    ],
  },
  {
    version: "0.9.2",
    date: "2026-06-01",
    title: "Faster navigation between pages",
    highlights: [
      "Quicker switching between Dashboard, Policies, Audit logs, and Settings",
      "A loading skeleton appears while pages fetch data",
      "Fewer repeated sign-in checks on every navigation",
    ],
    changes: [
      {
        type: "fix",
        description:
          "Permissions are not reloaded from the database on every page change",
      },
      {
        type: "improvement",
        description:
          "Session checks are shared within a request so navigation feels snappier",
      },
      {
        type: "improvement",
        description:
          "Header branding and profile data are reused across page loads",
      },
      {
        type: "improvement",
        description:
          "App-wide loading skeleton for smoother tab transitions",
      },
      {
        type: "improvement",
        description:
          "Orders and logistics lists use a unified search toolbar with colored badges",
      },
    ],
  },
  {
    version: "0.9.1",
    date: "2026-06-01",
    title: "Logistics UX polish",
    highlights: [
      "Status badges use plain labels instead of redundant technical codes",
      "Color-coded Accept vs approve buttons; confirm before key logistics actions",
    ],
    changes: [
      {
        type: "improvement",
        description:
          "Logistics and ops status badges show human-readable labels",
      },
      {
        type: "improvement",
        description:
          "Accept and approve actions use distinct colors so intent is clearer",
      },
      {
        type: "improvement",
        description:
          "Confirm before accepting a delivery or approving a transfer",
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-06-01",
    title: "Planogram, MIL, and SKU status",
    highlights: [
      "Branch planogram with shelf capacity and MIL day thresholds",
      "SKU status (active / hold / retired) with audit trail",
      "Orders limited to planogram SKUs, with special-order exception",
      "Dashboard alerts for below-capacity and MIL aging",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Settings → Planogram for authorized SKUs, max qty, and MIL days per branch",
      },
      {
        type: "feature",
        description:
          "Master data models let you set SKU status with audit logging",
      },
      {
        type: "feature",
        description:
          "Orders filter models by branch planogram and validate max qty; special orders allow off-planogram SKUs",
      },
      {
        type: "feature",
        description:
          "Dashboard shows below-capacity and MIL threshold counts for your branches",
      },
      {
        type: "improvement",
        description:
          "Demo seed expanded with multi-model planogram and MIL scenarios",
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-06-01",
    title: "Inventory ops MVP",
    highlights: [
      "Branches, warehouses, master data, and users scoped to their areas of responsibility",
      "Serialized inventory and branch orders with multi-step approval",
      "Logistics MVP: delivery acceptance, transfers, and pull-outs",
      "Sales stub and dashboard KPIs for pending work",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Settings for Branches, Master data, and AORs with starter roles",
      },
      {
        type: "feature",
        description:
          "Inventory list filtered to your branches with audited status changes",
      },
      {
        type: "feature",
        description:
          "Orders create and approval workflow with optional email notifications",
      },
      {
        type: "feature",
        description:
          "Logistics and sales transaction screens for day-to-day ops",
      },
      {
        type: "feature",
        description:
          "Dashboard KPIs for pending approvals, in-transit, stock, and open returns",
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06-01",
    title: "Full policy document control",
    highlights: [
      "Read-only policy access for employees and auditors",
      "Version history and new revisions on approved policies",
      "Reviewer workflow with comments, email notifications, attachments, and PDF export",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Browse approved policies without edit rights when you have view access",
      },
      {
        type: "feature",
        description:
          "Approved policies get a new draft revision instead of editing in place",
      },
      {
        type: "feature",
        description:
          "Review timeline with optional comments on submit, approve, and revert",
      },
      {
        type: "feature",
        description:
          "Email notifications to reviewers and authors when configured",
      },
      {
        type: "feature",
        description:
          "Attachments (PDF, Word, images) per policy version",
      },
      {
        type: "feature",
        description:
          "Export PDF for policies that are in review or approved",
      },
    ],
  },
  {
    version: "0.1.4",
    date: "2026-06-01",
    title: "Departments, audit log, and policies",
    highlights: [
      "Departments under Settings with defaults on registration",
      "Paginated audit log for compliance review",
      "Policy drafts with submit-for-review and approve",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Settings → Departments — create, edit, and delete with a guard when users are assigned",
      },
      {
        type: "feature",
        description:
          "Settings → Audit log — filter by action and type with pagination",
      },
      {
        type: "feature",
        description:
          "Company branding changes (name, tagline, logo) write audit events",
      },
      {
        type: "feature",
        description:
          "Policies — list, create, edit drafts, submit for review, and approve",
      },
    ],
  },
  {
    version: "0.1.3",
    date: "2026-06-01",
    title: "Branding and What’s new polish",
    highlights: [
      "Upload a company logo in Company Settings (shown in your sidebar)",
      "What’s new in the page header with clearer release notes",
      "Add actions sit beside table search on Users, Roles, and Permissions",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Company logo upload (JPEG, PNG, or WebP) for your organization only",
      },
      {
        type: "feature",
        description:
          "Company branding managed by Tenant Admin; Super Admin can always edit",
      },
      {
        type: "improvement",
        description:
          "What’s new button on every app page header",
      },
      {
        type: "improvement",
        description:
          "Release notes with sticky pagination and color-coded Feature / Improvement / Fix badges",
      },
      {
        type: "improvement",
        description:
          "Add user, role, and permission actions aligned with table search",
      },
    ],
  },
  {
    version: "0.1.2",
    date: "2026-06-01",
    title: "Settings and permissions",
    highlights: [
      "Edit and delete users and roles with search on settings tables",
      "Global permissions catalog for platform operators",
      "Sidebar shows only modules you are allowed to open",
    ],
    changes: [
      {
        type: "feature",
        description:
          "Edit user — name, email, role, and department",
      },
      {
        type: "feature",
        description:
          "Edit and delete roles with user counts; system roles stay protected",
      },
      {
        type: "feature",
        description:
          "Permissions catalog for Super Admin to create and manage permission names",
      },
      {
        type: "feature",
        description:
          "App modules linked to permissions so the sidebar respects access",
      },
      {
        type: "improvement",
        description: "Search on Users and Roles tables",
      },
      {
        type: "improvement",
        description:
          "Sticky roles and permissions matrix with row actions",
      },
      {
        type: "improvement",
        description:
          "Shared delete confirmation for settings tables",
      },
      {
        type: "improvement",
        description:
          "User menu with profile settings and sign out",
      },
      {
        type: "improvement",
        description: "Profile photo upload and removal",
      },
      {
        type: "improvement",
        description: "What’s new link on the login screen",
      },
      {
        type: "fix",
        description:
          "Platform-operator roles hidden from tenant role pickers and protected from deletion",
      },
    ],
  },
  {
    version: "0.1.1",
    date: "2026-06-01",
    title: "What’s new dialog",
    highlights: ["What’s new shows paginated release notes"],
    changes: [
      {
        type: "feature",
        description: "What’s new dialog on login and the auth sidebar",
      },
      {
        type: "improvement",
        description: "Release notes paginate one version at a time",
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-06-01",
    title: "Initial release",
    highlights: [
      "Sign-in with roles scoped to each organization",
      "User and role management for dealer organizations",
      "Dashboard shell and Settings foundation",
    ],
    changes: [
      {
        type: "feature",
        description: "Email and password sign-in",
      },
      {
        type: "feature",
        description: "Organization-scoped roles and permissions",
      },
      {
        type: "feature",
        description: "Settings for users, roles, and profile",
      },
    ],
  },
];
