import type { ObjectId } from 'mongodb';
import type { EncryptedField } from '@/lib/security/crypto';

/**
 * PRD §9 — MongoDB document shapes.
 *
 * Fields typed `EncryptedField` are AES-256-GCM ciphertext on disk (PRD §8.1).
 * Repositories own the encrypt/decrypt boundary; nothing above them sees
 * ciphertext.
 */

export const COLLECTIONS = {
  users: 'users',
  documents: 'documents',
  candidateFacts: 'candidateFacts',
  roles: 'roles',
  questionSets: 'questionSets',
  sessions: 'sessions',
  turns: 'turns',
  auditLog: 'auditLog',
} as const;

export type UserRole = 'candidate' | 'interviewer';
export type Level = 'junior' | 'mid' | 'senior';
export const LEVELS: Level[] = ['junior', 'mid', 'senior'];

// ── users ───────────────────────────────────────────────────────────────
export interface UserDoc {
  _id: ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  /** Stable display handle for anonymised interviewer views (PRD §8.3). */
  pseudonym: string;
  createdAt: Date;
}

// ── documents (CV uploads and scraped pages) ────────────────────────────
export type DocumentKind = 'cv' | 'url' | 'company';

export interface DocumentDoc {
  _id: ObjectId;
  userId: ObjectId;
  kind: DocumentKind;
  filename?: string;
  url?: string;
  rawText: EncryptedField;
  mimeType: string;
  sizeBytes: number;
  fetchedAt: Date;
  createdAt: Date;
}

// ── candidateFacts ──────────────────────────────────────────────────────
export type FactKind = 'employment' | 'project' | 'education' | 'skill' | 'achievement' | 'gap';
export type Confidence = 'high' | 'medium' | 'low';

export interface CandidateFactDoc {
  _id: ObjectId;
  userId: ObjectId;
  kind: FactKind;
  summary: EncryptedField;
  evidence: {
    sourceId: ObjectId;
    /** VERBATIM span from the source. Validated as a literal substring (PRD §5.2). */
    quote: EncryptedField;
    offset: number;
  };
  confidence: Confidence;
  confirmedByUser: boolean;
  confirmedAt: Date | null;
  createdAt: Date;
}

/** The decrypted, application-facing shape. */
export interface CandidateFact {
  id: string;
  kind: FactKind;
  summary: string;
  evidence: { sourceId: string; quote: string; offset: number };
  confidence: Confidence;
  confirmedByUser: boolean;
}

// ── roles ───────────────────────────────────────────────────────────────
export interface RoleDoc {
  _id: ObjectId;
  title: string;
  description: string;
  competencies: string[];
  levels: Level[];
  createdBy: ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── questionSets ────────────────────────────────────────────────────────
export type QuestionKind = 'behavioural' | 'technical' | 'situational' | 'company';

export interface GeneratedQuestion {
  id: string;
  text: string;
  competency: string;
  difficulty: Level;
  kind: QuestionKind;
  /** CandidateFact ids. Empty means a generic question, which is allowed. */
  groundedIn: string[];
  expectedPoints: string[];
}

export interface QuestionSetDoc {
  _id: ObjectId;
  roleId: ObjectId;
  level: Level;
  /** Set when the question set is personalised to one candidate. */
  userId: ObjectId | null;
  /**
   * The GeneratedQuestion[] serialised to JSON and encrypted.
   *
   * A grounded question quotes the candidates CV back at them ("the settlements
   * service migration at Paystack"), which makes it personal data in the same
   * sense the transcript is. Encrypting the whole array rather than the text
   * field of each question keeps one rule to explain and one place to get wrong.
   */
  questions: EncryptedField;
  questionCount: number;
  generatedBy: { provider: string; model: string };
  generatedAt: Date;
}

/** The decrypted, application-facing question set. */
export interface QuestionSet {
  id: string;
  roleId: string;
  level: Level;
  userId: string | null;
  questions: GeneratedQuestion[];
  generatedBy: { provider: string; model: string };
  generatedAt: Date;
}

// ── sessions ────────────────────────────────────────────────────────────
export type SessionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface DifficultyChange {
  turnIndex: number;
  from: Level;
  to: Level;
  trigger: string;
}

export interface SubScores {
  relevance: number;
  clarity: number;
  structure: number;
  pace: number;
}

export interface SessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  roleId: ObjectId;
  roleTitle: string;
  level: Level;
  voiceId: string;
  status: SessionStatus;
  consent: { givenAt: Date; version: string; scope: string[] };
  questionSetId: ObjectId | null;
  plannedQuestionCount: number;
  startedAt: Date;
  completedAt: Date | null;
  durationSec: number | null;
  startingDifficulty: Level;
  currentDifficulty: Level;
  difficultyChanges: DifficultyChange[];
  overallScore: number | null;
  subScores: SubScores | null;
  summary: string | null;
  strengths: string[];
  improvements: string[];
  /** Set by the retention job once the transcripts behind this session are gone. */
  retentionPurgedAt?: Date;
}

// ── turns ───────────────────────────────────────────────────────────────
export type InputMode = 'voice' | 'text';

export interface TurnTimings {
  questionSpokenAt: number | null;
  answerStartedAt: number | null;
  answerEndedAt: number | null;
  thinkingTimeMs: number | null;
  speakingTimeMs: number | null;
}

export interface TurnMetrics {
  wordCount: number;
  wpm: number | null;
  fillerCount: number;
  fillerRate: number;
}

export interface TurnScores extends SubScores {
  total: number;
}

export interface TurnDoc {
  _id: ObjectId;
  sessionId: ObjectId;
  index: number;
  questionId: string;
  /** Encrypted: a grounded question can quote the CV. See QuestionSetDoc.questions. */
  questionText: EncryptedField;
  isFollowUp: boolean;
  difficulty: Level;
  groundedIn: string[];
  transcript: EncryptedField;
  inputMode: InputMode;
  timings: TurnTimings;
  metrics: TurnMetrics;
  /** v2 slots reserved so speech-emotion and facial analysis need no migration (PRD §2.1). */
  modalities: {
    verbal: { coveredPoints: string[]; missedPoints: string[] } | null;
    vocal: null;
    visual: null;
  };
  scores: TurnScores;
  feedback: string;
  llm: { provider: string; model: string; latencyMs: number };
  createdAt: Date;
  /** Set when the transcript was blanked by the retention purge (PRD §8.4). */
  retentionPurgedAt?: Date;
}

// ── auditLog ────────────────────────────────────────────────────────────
export type AuditAction =
  | 'session.reveal_identity'
  | 'privacy.export'
  | 'privacy.delete'
  | 'facts.confirm'
  | 'role.create'
  | 'role.update'
  | 'role.delete'
  | 'questions.generate';

export interface AuditLogDoc {
  _id: ObjectId;
  actorId: ObjectId | null;
  action: AuditAction;
  subjectId: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
}
