import type { PageTutorialContent } from "@/components/page-tutorial/types";
import {
  HELP_FAQ_CATEGORIES,
  HELP_QUICK_LINKS,
  HELP_WORKFLOW_GUIDES,
} from "@/content/help-support";
import { AORS_MODULE_GUIDE } from "@/content/module-guides/aors";
import { INVENTORY_MODULE_GUIDE } from "@/content/module-guides/inventory";
import {
  DELIVERIES_MODULE_GUIDE,
  PULLOUTS_MODULE_GUIDE,
  TRANSFERS_MODULE_GUIDE,
} from "@/content/module-guides/logistics";
import { ORDERS_MODULE_GUIDE } from "@/content/module-guides/orders";
import {
  BRANCH_PLANOGRAM_MODULE_GUIDE,
  PLANOGRAM_MODULE_GUIDE,
} from "@/content/module-guides/planogram";
import {
  PLANNING_MODULE_GUIDE,
  SUGGESTED_ORDERS_MODULE_GUIDE,
} from "@/content/module-guides/planning";
import { RETURNS_MODULE_GUIDE } from "@/content/module-guides/returns";
import {
  ROLES_MATRIX_MODULE_GUIDE,
  ROLES_MODULE_GUIDE,
} from "@/content/module-guides/roles";
import { SALES_MODULE_GUIDE } from "@/content/module-guides/sales";
import { SC_OPS_MODULE_GUIDE } from "@/content/module-guides/service-center-ops";
import type { ModuleGuideContent } from "@/content/module-guides/types";
import { WAREHOUSE_STOCK_MODULE_GUIDE } from "@/content/module-guides/warehouse-stock";
import { AORS_PAGE_TUTORIAL } from "@/content/page-tutorials/aors";
import { BRANCH_ORDERS_PAGE_TUTORIAL } from "@/content/page-tutorials/branch-orders";
import { BRANCHES_PAGE_TUTORIAL } from "@/content/page-tutorials/branches";
import { COMPANY_PAGE_TUTORIAL } from "@/content/page-tutorials/company";
import { DASHBOARD_PAGE_TUTORIAL } from "@/content/page-tutorials/dashboard";
import { DEALERS_PAGE_TUTORIAL } from "@/content/page-tutorials/dealers";
import { DELIVERIES_PAGE_TUTORIAL } from "@/content/page-tutorials/deliveries";
import { DEPARTMENTS_PAGE_TUTORIAL } from "@/content/page-tutorials/departments";
import { INVENTORY_PAGE_TUTORIAL } from "@/content/page-tutorials/inventory";
import { MASTER_DATA_PAGE_TUTORIAL } from "@/content/page-tutorials/master-data";
import { OFFICIAL_SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/official-sales";
import { OPERATIONS_PAGE_TUTORIAL } from "@/content/page-tutorials/operations";
import { PERMISSIONS_PAGE_TUTORIAL } from "@/content/page-tutorials/permissions";
import { PLANNING_PAGE_TUTORIAL } from "@/content/page-tutorials/planning";
import { PLANOGRAM_PAGE_TUTORIAL } from "@/content/page-tutorials/planogram";
import { POLICIES_PAGE_TUTORIAL } from "@/content/page-tutorials/policies";
import { PULLOUTS_PAGE_TUTORIAL } from "@/content/page-tutorials/pullouts";
import { RETURNS_PAGE_TUTORIAL } from "@/content/page-tutorials/returns";
import { ROLES_PAGE_TUTORIAL } from "@/content/page-tutorials/roles";
import { SALES_PAGE_TUTORIAL } from "@/content/page-tutorials/sales";
import {
  SC_DELIVERIES_PAGE_TUTORIAL,
  SC_INVENTORY_PAGE_TUTORIAL,
  SC_ORDERS_PAGE_TUTORIAL,
  SC_PULLOUTS_PAGE_TUTORIAL,
  SC_SALES_PAGE_TUTORIAL,
} from "@/content/page-tutorials/service-center-ops";
import { SERVICE_CENTERS_PAGE_TUTORIAL } from "@/content/page-tutorials/service-centers";
import { STATUS_SETTINGS_PAGE_TUTORIAL } from "@/content/page-tutorials/status";
import { STOCK_COUNT_PAGE_TUTORIAL } from "@/content/page-tutorials/stock-count";
import { SUGGESTED_ORDERS_PAGE_TUTORIAL } from "@/content/page-tutorials/suggested-orders";
import { TRANSFERS_PAGE_TUTORIAL } from "@/content/page-tutorials/transfers";
import { USERS_PAGE_TUTORIAL } from "@/content/page-tutorials/users";
import { WAREHOUSE_STOCK_PAGE_TUTORIAL } from "@/content/page-tutorials/warehouse-stock";
import { WAREHOUSES_PAGE_TUTORIAL } from "@/content/page-tutorials/warehouses";

export type HelpChunkKind =
  | "faq"
  | "workflow"
  | "quick-link"
  | "tutorial"
  | "module-guide";

export interface HelpChunk {
  id: string;
  title: string;
  kind: HelpChunkKind;
  href?: string;
  audience?: string;
  text: string;
}

export interface HelpSearchHit {
  id: string;
  title: string;
  kind: HelpChunkKind;
  href?: string;
  excerpt: string;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 1);
}

function tutorialText(tutorial: PageTutorialContent): string {
  const parts = [
    tutorial.dialogTitle,
    tutorial.dialogDescription ?? "",
    ...tutorial.sections.flatMap((section) => [
      section.title,
      section.description ?? "",
      ...(section.bullets ?? []),
    ]),
  ];
  return parts.filter(Boolean).join(" ");
}

function moduleGuideText(guide: ModuleGuideContent): string {
  return [guide.title, guide.description, ...guide.tips.map((tip) => tip.label)]
    .filter(Boolean)
    .join(" ");
}

function tutorialChunk(tutorial: PageTutorialContent): HelpChunk {
  return {
    id: `tutorial:${tutorial.id}`,
    title: tutorial.dialogTitle,
    kind: "tutorial",
    href: tutorial.helpHref ?? "/help",
    text: tutorialText(tutorial),
  };
}

function moduleGuideChunk(
  id: string,
  guide: ModuleGuideContent,
  href: string,
): HelpChunk {
  return {
    id: `module-guide:${id}`,
    title: guide.title,
    kind: "module-guide",
    href,
    text: moduleGuideText(guide),
  };
}

const TUTORIALS: PageTutorialContent[] = [
  DASHBOARD_PAGE_TUTORIAL,
  USERS_PAGE_TUTORIAL,
  ROLES_PAGE_TUTORIAL,
  PERMISSIONS_PAGE_TUTORIAL,
  DEPARTMENTS_PAGE_TUTORIAL,
  COMPANY_PAGE_TUTORIAL,
  BRANCHES_PAGE_TUTORIAL,
  DEALERS_PAGE_TUTORIAL,
  WAREHOUSES_PAGE_TUTORIAL,
  WAREHOUSE_STOCK_PAGE_TUTORIAL,
  AORS_PAGE_TUTORIAL,
  MASTER_DATA_PAGE_TUTORIAL,
  STATUS_SETTINGS_PAGE_TUTORIAL,
  PLANNING_PAGE_TUTORIAL,
  PLANOGRAM_PAGE_TUTORIAL,
  SUGGESTED_ORDERS_PAGE_TUTORIAL,
  INVENTORY_PAGE_TUTORIAL,
  STOCK_COUNT_PAGE_TUTORIAL,
  BRANCH_ORDERS_PAGE_TUTORIAL,
  SALES_PAGE_TUTORIAL,
  RETURNS_PAGE_TUTORIAL,
  DELIVERIES_PAGE_TUTORIAL,
  TRANSFERS_PAGE_TUTORIAL,
  PULLOUTS_PAGE_TUTORIAL,
  OPERATIONS_PAGE_TUTORIAL,
  OFFICIAL_SALES_PAGE_TUTORIAL,
  POLICIES_PAGE_TUTORIAL,
  SERVICE_CENTERS_PAGE_TUTORIAL,
  SC_INVENTORY_PAGE_TUTORIAL,
  SC_SALES_PAGE_TUTORIAL,
  SC_ORDERS_PAGE_TUTORIAL,
  SC_DELIVERIES_PAGE_TUTORIAL,
  SC_PULLOUTS_PAGE_TUTORIAL,
];

function buildCorpus(): HelpChunk[] {
  const chunks: HelpChunk[] = [];

  for (const faqCategory of HELP_FAQ_CATEGORIES) {
    for (const item of faqCategory.items) {
      chunks.push({
        id: `faq:${item.id}`,
        title: item.question,
        kind: "faq",
        href: "/help#faq",
        audience: faqCategory.title,
        text: `${item.question} ${item.answer}`,
      });
    }
  }

  for (const guide of HELP_WORKFLOW_GUIDES) {
    chunks.push({
      id: `workflow:${guide.id}`,
      title: guide.title,
      kind: "workflow",
      href: guide.href,
      audience: guide.audience,
      text: [
        guide.title,
        guide.summary,
        guide.audience,
        ...guide.steps.map((step) => step.label),
        ...(guide.tips ?? []),
      ].join(" "),
    });
  }

  for (const link of HELP_QUICK_LINKS) {
    chunks.push({
      id: `quick:${link.id}`,
      title: link.title,
      kind: "quick-link",
      href: link.href,
      text: `${link.title} ${link.description}`,
    });
  }

  for (const tutorial of TUTORIALS) {
    chunks.push(tutorialChunk(tutorial));
  }

  chunks.push(
    moduleGuideChunk("planning", PLANNING_MODULE_GUIDE, "/settings/planning"),
    moduleGuideChunk(
      "suggested-orders",
      SUGGESTED_ORDERS_MODULE_GUIDE,
      "/planning/suggested-orders",
    ),
    moduleGuideChunk("planogram", PLANOGRAM_MODULE_GUIDE, "/settings/planogram"),
    moduleGuideChunk(
      "branch-planogram",
      BRANCH_PLANOGRAM_MODULE_GUIDE,
      "/settings/planogram",
    ),
    moduleGuideChunk("inventory", INVENTORY_MODULE_GUIDE, "/inventory"),
    moduleGuideChunk(
      "warehouse-stock",
      WAREHOUSE_STOCK_MODULE_GUIDE,
      "/inventory/warehouse-stock",
    ),
    moduleGuideChunk("deliveries", DELIVERIES_MODULE_GUIDE, "/logistics/deliveries"),
    moduleGuideChunk("transfers", TRANSFERS_MODULE_GUIDE, "/logistics/transfers"),
    moduleGuideChunk("pullouts", PULLOUTS_MODULE_GUIDE, "/logistics/pickups"),
    moduleGuideChunk("orders", ORDERS_MODULE_GUIDE, "/orders"),
    moduleGuideChunk("sales", SALES_MODULE_GUIDE, "/sales"),
    moduleGuideChunk("returns", RETURNS_MODULE_GUIDE, "/returns"),
    moduleGuideChunk("roles", ROLES_MODULE_GUIDE, "/settings/roles"),
    moduleGuideChunk("roles-matrix", ROLES_MATRIX_MODULE_GUIDE, "/settings/roles"),
    moduleGuideChunk("aors", AORS_MODULE_GUIDE, "/settings/aors"),
    moduleGuideChunk("sc-ops", SC_OPS_MODULE_GUIDE, "/service-centers/inventory"),
    {
      id: "module-guide:status",
      title: "Status settings",
      kind: "module-guide",
      href: "/settings/status",
      text: "Status settings: keep system codes and deactivate instead of delete. Badge colors show on Inventory, Logistics, and Sales.",
    },
  );

  return chunks;
}

const CORPUS = buildCorpus();

function scoreChunk(queryTokens: string[], chunk: HelpChunk): number {
  if (queryTokens.length === 0) return 0;
  const haystack = tokenize(`${chunk.title} ${chunk.audience ?? ""} ${chunk.text}`);
  const set = new Set(haystack);
  let score = 0;
  for (const token of queryTokens) {
    if (set.has(token)) score += 2;
    else if (haystack.some((word) => word.includes(token) || token.includes(word))) {
      score += 1;
    }
  }
  const titleTokens = tokenize(chunk.title);
  for (const token of queryTokens) {
    if (titleTokens.includes(token)) score += 3;
  }
  return score;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Drop a leading title/question so snippets are answer-only. */
export function bodyWithoutTitle(title: string, text: string): string {
  const compact = collapseWhitespace(text);
  const compactTitle = collapseWhitespace(title);
  if (!compact || !compactTitle) return compact;
  if (compact.toLowerCase() === compactTitle.toLowerCase()) return compact;
  const pattern = new RegExp(
    `^${escapeRegExp(compactTitle)}(?:\\s*[—–:\\-]+\\s*|\\s+)`,
    "i",
  );
  const stripped = compact.replace(pattern, "").trim();
  return stripped || compact;
}

function excerptFor(chunk: HelpChunk): string {
  const compact = bodyWithoutTitle(chunk.title, chunk.text);
  return compact.length > 420 ? `${compact.slice(0, 417)}…` : compact;
}

export function searchHelpCorpus(query: string, limit = 6): HelpSearchHit[] {
  const queryTokens = tokenize(query);
  const ranked = CORPUS.map((chunk) => ({
    chunk,
    score: scoreChunk(queryTokens, chunk),
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (ranked.length > 0) {
    return ranked.map(({ chunk }) => ({
      id: chunk.id,
      title: chunk.title,
      kind: chunk.kind,
      href: chunk.href,
      excerpt: excerptFor(chunk),
    }));
  }

  return CORPUS.slice(0, Math.min(4, limit)).map((chunk) => ({
    id: chunk.id,
    title: chunk.title,
    kind: chunk.kind,
    href: chunk.href,
    excerpt: excerptFor(chunk),
  }));
}

export function formatHelpHitsForPrompt(hits: HelpSearchHit[]): string {
  return hits
    .map(
      (hit, index) =>
        `[${index + 1}] ${hit.title} (${hit.kind}${hit.href ? ` · ${hit.href}` : ""})\n${hit.excerpt}`,
    )
    .join("\n\n");
}
