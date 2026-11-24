export type UserRole =
  | 'registered_user'
  | 'qa_moderator'
  | 'content_editor'
  | 'administrator'
  | 'super_admin';

export type ContentStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'UNPUBLISHED'
  | 'ARCHIVED';

export type ContentType =
  | 'lecture'
  | 'tafseer'
  | 'hadith'
  | 'speech'
  | 'qa'
  | 'document'
  | 'lesson';

export type QAStatus = 'PENDING' | 'ANSWERED' | 'PUBLISHED' | 'REJECTED';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  preferredLanguage: string;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryItem {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  nameLg: string;
  description: string;
  sortOrder: number;
  isCore: boolean;
  itemCount?: number;
  createdAt: string;
}

export interface SeriesItem {
  id: string;
  title: string;
  titleAr: string;
  titleLg: string;
  description: string;
  speaker: string;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  coverImage: string | null;
  episodeCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AudioAttachment {
  url: string;
  path: string;
  sizeBytes: number;
  durationSeconds: number;
  format: string;
}

export interface DocumentAttachment {
  url: string;
  path: string;
  sizeBytes: number;
  format: string;
  documentType: string;
}

export interface TranscriptData {
  en: string;
  ar: string;
  lg: string;
  language: string;
}

export interface ContentItem {
  id: string;
  title: string;
  titleAr: string;
  titleLg: string;
  description: string;
  descriptionAr: string;
  descriptionLg: string;
  contentType: string;
  categoryId: string | null;
  categorySlug: string;
  categoryName: string;
  categoryNameAr: string;
  categoryNameLg: string;
  subcategory: string;
  seriesId: string | null;
  seriesTitle: string | null;
  episodeNumber: number | null;
  speaker: string;
  date: string;
  location: string;
  coverImage: string | null;
  audio: AudioAttachment | null;
  document: DocumentAttachment | null;
  transcript: TranscriptData | null;
  quranReferences: string;
  tags: string[];
  language: string;
  status: ContentStatus;
  featured: boolean;
  playCount: number;
  downloadCount: number;
  createdBy: string | null;
  updatedBy: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface QASubmission {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  topic: string;
  questionText: string;
  status: QAStatus;
  answerText: string;
  answerTextAr: string;
  answerTextLg: string;
  answerAudio: AudioAttachment | null;
  answerDocument: DocumentAttachment | null;
  publishedContentId: string | null;
  answeredBy: string | null;
  createdAt: string;
  updatedAt: string;
  answeredAt: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  titleAr: string;
  titleLg: string;
  message: string;
  messageAr: string;
  messageLg: string;
  type: string;
  contentId: string | null;
  contentTitle?: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string;
  createdAt: string;
}

export interface OverviewStats {
  totalContent: number;
  publishedContent: number;
  draftContent: number;
  totalPlays: number;
  totalDownloads: number;
  pendingQa: number;
  answeredQa: number;
  totalUsers: number;
  totalSeries: number;
  totalCategories: number;
  storageUsedBytes: number;
  storageByBucket: Record<string, number>;
}

export interface ConnectionInfo {
  apiBaseUrl: string;
  defaultOrigins: string[];
  envOrigins: string[];
  customOrigins: string[];
  activeOrigins: string[];
}
