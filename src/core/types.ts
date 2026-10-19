// 題庫交換格式 1.0.0 的型別（對應 CONTENT_SCHEMA.md 與 quiz.schema.json）。
// 注意：這裡完全不含讀者的作答、信心或筆記；那些在 src/session。

export type ItemType = 'single' | 'multiple' | 'reflection';
export type SourceType = 'law' | 'judgment' | 'research' | 'reporting' | 'commentary' | 'official' | 'other';
export type Lifecycle = 'draft' | 'published' | 'expired' | 'withdrawn';
export type Verification = 'unreviewed' | 'pending' | 'reviewed';

export interface Option {
  id: string;
  label: string;
}

export interface Author {
  id: string;
  displayName: string;
  credentialText: string;
}

export interface Source {
  id: string;
  title: string;
  url: string;
  type: SourceType;
  publisher: string;
  publishedAt: string | null;
  accessedAt: string;
  locator: string;
  rights: 'link_only' | 'permission' | 'open_license' | 'unknown';
  license?: string;
}

export interface Reviewer {
  id: string;
  scope: 'domain' | 'education';
  decision: 'approve' | 'revise' | 'reject';
  reviewedAt: string;
  notes: string;
}

export interface Item {
  id: string;
  version: string;
  authorIds: string[];
  concepts: string[];
  topic: string;
  language: string;
  jurisdiction: string;
  context: string;
  intuition: { kind: 'value' | 'prediction'; prompt: string; options: Option[] };
  knowledge: {
    type: ItemType;
    prompt: string;
    options: Option[];
    correctOptionIds: string[];
    rationale: string;
  };
  explanation: {
    short: string;
    mechanism: string;
    possibleReasons: string;
    alternatives: string;
    limitations: string;
    misconception: string;
  };
  epistemic: 'settled' | 'disputed' | 'uncertain';
  disputeScope: 'none' | 'rationale' | 'answer';
  evidenceIds: string[];
  readingIds: string[];
  discussionPrompts: string[];
  search: {
    profileId: string;
    keywords: string[];
    categories: Array<'news' | 'argument' | 'comparison' | 'official' | 'academic'>;
    region: string;
    language: string;
  };
  validity: {
    asOf: string;
    validFrom: string;
    validUntil: string | null;
    reviewDueAt: string;
    knowledgeVersion: string;
  };
  governance: {
    lifecycle: Lifecycle;
    verification: Verification;
    lastReviewedAt: string | null;
    reviewers: Reviewer[];
    notes: string;
  };
  translationOf?: { id: string; version: string; locale: string };
  extensions?: Record<string, unknown>;
}

export interface QuizPackage {
  schemaVersion: '1.0.0';
  namespace: string;
  quizId: string;
  version: string;
  title: string;
  description: string;
  locale: string;
  direction: 'ltr' | 'rtl';
  license: string;
  authors: Author[];
  sources: Source[];
  items: Item[];
}

export interface ValidationError {
  /** JSON Pointer，例如 /items/0/knowledge/correctOptionIds/0 */
  path: string;
  code: string;
  message: string;
}

/** 可信狀態目錄（GET /content/status.json）。 */
export interface StatusEntry {
  itemId: string;
  version: string;
  locale: string;
  sha256: string;
  lifecycle: Lifecycle;
  verification: Verification;
  reviewerOrg: string | null;
  reason: string | null;
  supersededBy: string | null;
}

export interface StatusCatalog {
  generatedAt: string;
  expiresAt: string;
  entries: StatusEntry[];
}

/** GET /content/catalog.json */
export interface CatalogEntry {
  namespace: string;
  quizId: string;
  version: string;
  locale: string;
  title: string;
  description: string;
  itemCount: number;
  path: string;
  sha256: string;
  bytes: number;
}

export interface Catalog {
  generatedAt: string;
  quizzes: CatalogEntry[];
}
