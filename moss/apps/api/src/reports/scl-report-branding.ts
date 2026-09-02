import { existsSync } from 'fs';
import { join } from 'path';
import type { ConfigService } from '@nestjs/config';

/**
 * Central SCL (Security Cost Leakage) PDF report branding.
 * Override defaults via env — do not duplicate these strings across services.
 */
export type SclReportBrandConfig = {
  consultancyName: string;
  shortName: string;
  website: string;
  websiteDisplay: string;
  email: string;
  phone: string;
  phoneTel: string;
  brandColor: string;
  inkColor: string;
  mutedColor: string;
  /** Product line shown on the cover under the consultancy name. */
  productLine: string;
  /** Right-header series / product eyebrow (Article 5 style). */
  documentEyebrow: string;
  /** Black footer tagline lines. */
  taglineLines: string[];
  /** Filename product segment (no spaces). */
  fileNameProductSegment: string;
  /** Relative logo filename under reports/assets (or absolute override via env). */
  logoFileName: string;
  /** Prospect CTA button URL (Book MOSS Assessment). */
  ctaUrl: string;
  /** Prospect CTA button label. */
  ctaLabel: string;
};

export const DEFAULT_SCL_REPORT_BRANDING: SclReportBrandConfig = {
  consultancyName: 'Physical Risk Consultancy (Pty) Ltd',
  shortName: 'Physical Risk',
  website: 'https://www.physicalrisk.com',
  websiteDisplay: 'physicalrisk.com',
  email: 'sales@physicalrisk.com',
  phone: '+27 82 410 9305',
  phoneTel: '+27824109305',
  /** Matches Governance Failure Series™ article red (#d20a11). */
  brandColor: '#d20a11',
  inkColor: '#2d2d2d',
  mutedColor: '#666666',
  productLine: 'Security Cost Leakage Assessment',
  documentEyebrow: 'SECURITY COST LEAKAGE ASSESSMENT',
  taglineLines: [
    'INDEPENDENT ASSURANCE.',
    'MEASURABLE PERFORMANCE.',
    'STRONGER GOVERNANCE.',
  ],
  fileNameProductSegment: 'Physical-Risk-Security-Cost-Leakage',
  logoFileName: 'physical-risk-logo.jpg',
  ctaUrl: 'https://test.physicalrisk.com/#contact',
  ctaLabel: 'Request an Executive Advisory Proposal',
};

export type SclReportDocumentMeta = {
  reportTitle: string;
  companyName: string;
  assessmentDate: Date;
  assessmentDateLabel: string;
  assessmentDateIso: string;
  reference: string;
  methodologyVersion?: string;
  isPreliminary: boolean;
};

export type SclReportFileNameInput = {
  companyName?: string | null;
  assessmentDate?: Date | string | null;
  reference?: string | null;
  brand?: Pick<SclReportBrandConfig, 'fileNameProductSegment'>;
};

/** Characters unsafe in download filenames across Windows / macOS / email clients. */
const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|]+/g;

export function resolveSclReportBrandConfig(config?: ConfigService | null): SclReportBrandConfig {
  const get = (key: string, fallback: string) => {
    const value = config?.get<string>(key);
    return value && String(value).trim() ? String(value).trim() : fallback;
  };

  return {
    consultancyName: get('SCL_REPORT_CONSULTANCY_NAME', DEFAULT_SCL_REPORT_BRANDING.consultancyName),
    shortName: get('SCL_REPORT_SHORT_NAME', DEFAULT_SCL_REPORT_BRANDING.shortName),
    website: get('SCL_REPORT_WEBSITE', DEFAULT_SCL_REPORT_BRANDING.website),
    websiteDisplay: get('SCL_REPORT_WEBSITE_DISPLAY', DEFAULT_SCL_REPORT_BRANDING.websiteDisplay),
    email: get('SCL_REPORT_EMAIL', DEFAULT_SCL_REPORT_BRANDING.email),
    phone: get('SCL_REPORT_PHONE', DEFAULT_SCL_REPORT_BRANDING.phone),
    phoneTel: get('SCL_REPORT_PHONE_TEL', DEFAULT_SCL_REPORT_BRANDING.phoneTel),
    brandColor: get('SCL_REPORT_BRAND_COLOR', DEFAULT_SCL_REPORT_BRANDING.brandColor),
    inkColor: get('SCL_REPORT_INK_COLOR', DEFAULT_SCL_REPORT_BRANDING.inkColor),
    mutedColor: get('SCL_REPORT_MUTED_COLOR', DEFAULT_SCL_REPORT_BRANDING.mutedColor),
    productLine: get('SCL_REPORT_PRODUCT_LINE', DEFAULT_SCL_REPORT_BRANDING.productLine),
    documentEyebrow: get('SCL_REPORT_DOCUMENT_EYEBROW', DEFAULT_SCL_REPORT_BRANDING.documentEyebrow),
    taglineLines: DEFAULT_SCL_REPORT_BRANDING.taglineLines,
    fileNameProductSegment: get(
      'SCL_REPORT_FILENAME_PRODUCT',
      DEFAULT_SCL_REPORT_BRANDING.fileNameProductSegment,
    ),
    logoFileName: get('SCL_REPORT_LOGO_FILE', DEFAULT_SCL_REPORT_BRANDING.logoFileName),
    ctaUrl: get('SCL_REPORT_CTA_URL', DEFAULT_SCL_REPORT_BRANDING.ctaUrl),
    ctaLabel: get('SCL_REPORT_CTA_LABEL', DEFAULT_SCL_REPORT_BRANDING.ctaLabel),
  };
}

/** Full-width slide header banner from the Physical Risk proposal PowerPoint master. */
export function resolveProposalSlideHeaderPath(): string | null {
  const absoluteOverride = process.env.PROPOSAL_SLIDE_HEADER_PATH?.trim();
  const candidates = [
    absoluteOverride,
    join(__dirname, 'assets', 'proposal-slide-header.png'),
    join(process.cwd(), 'src', 'reports', 'assets', 'proposal-slide-header.png'),
    join(process.cwd(), 'apps', 'api', 'src', 'reports', 'assets', 'proposal-slide-header.png'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Cover-page wordmark from the Example Tender PPTX (image1.jpg). */
export function resolveProposalCoverLogoPath(): string | null {
  const absoluteOverride = process.env.PROPOSAL_COVER_LOGO_PATH?.trim();
  const candidates = [
    absoluteOverride,
    join(__dirname, 'assets', 'proposal-cover-logo.jpg'),
    join(process.cwd(), 'src', 'reports', 'assets', 'proposal-cover-logo.jpg'),
    join(process.cwd(), 'apps', 'api', 'src', 'reports', 'assets', 'proposal-cover-logo.jpg'),
    join(__dirname, 'assets', 'physical_risk_logo_article.png'),
    join(process.cwd(), 'src', 'reports', 'assets', 'physical_risk_logo_article.png'),
    join(process.cwd(), 'apps', 'api', 'src', 'reports', 'assets', 'physical_risk_logo_article.png'),
    join(__dirname, 'assets', 'physical_risk_logo_main.png'),
    join(process.cwd(), '..', 'web', 'public', 'physical_risk_logo_main.png'),
    join(process.cwd(), 'apps', 'web', 'public', 'physical_risk_logo_main.png'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function resolveSclReportLogoPath(brand: SclReportBrandConfig = DEFAULT_SCL_REPORT_BRANDING): string | null {
  const absoluteOverride = process.env.SCL_REPORT_LOGO_PATH?.trim();
  const candidates = [
    absoluteOverride,
    // Preferred: Physical Risk wordmark used on the attached PDF
    join(__dirname, 'assets', 'physical-risk-logo.jpg'),
    join(process.cwd(), 'src', 'reports', 'assets', 'physical-risk-logo.jpg'),
    join(process.cwd(), 'apps', 'api', 'src', 'reports', 'assets', 'physical-risk-logo.jpg'),
    join(process.cwd(), '..', 'web', 'public', 'physical-risk-logo.jpg'),
    join(process.cwd(), 'apps', 'web', 'public', 'physical-risk-logo.jpg'),
    // Configured / legacy fallbacks
    join(__dirname, 'assets', brand.logoFileName),
    join(__dirname, 'assets', 'physical_risk_logo_article.png'),
    join(__dirname, 'assets', 'physical_risk_logo_main.png'),
    join(process.cwd(), 'src', 'reports', 'assets', brand.logoFileName),
    join(process.cwd(), 'src', 'reports', 'assets', 'physical_risk_logo_article.png'),
    join(process.cwd(), 'apps', 'api', 'src', 'reports', 'assets', brand.logoFileName),
    join(process.cwd(), '..', 'web', 'public', 'physical_risk_logo_main.png'),
    join(process.cwd(), 'apps', 'web', 'public', 'physical_risk_logo_main.png'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function formatAssessmentDateLabel(date: Date): string {
  return date.toLocaleString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatAssessmentDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildSclReportDocumentMeta(input: {
  organisationName?: string | null;
  reference?: string | null;
  assessmentDate?: Date | string | null;
  reportTypeLabel: string;
  methodologyVersion?: string | null;
  isPreliminary: boolean;
}): SclReportDocumentMeta {
  const date = input.assessmentDate ? new Date(input.assessmentDate) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const companyName = String(input.organisationName || '').trim() || String(input.reference || 'Assessment').trim();
  return {
    reportTitle: input.reportTypeLabel,
    companyName,
    assessmentDate: safeDate,
    assessmentDateLabel: formatAssessmentDateLabel(safeDate),
    assessmentDateIso: formatAssessmentDateIso(safeDate),
    reference: String(input.reference || 'UNREF').trim() || 'UNREF',
    methodologyVersion: input.methodologyVersion || undefined,
    isPreliminary: input.isPreliminary,
  };
}

/**
 * Sanitize a company / reference segment for use in a download filename.
 * Collapses whitespace to single hyphens; strips path and reserved characters.
 */
export function sanitizeReportFileNameSegment(value: string, fallback = 'Assessment'): string {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(UNSAFE_FILENAME_CHARS, ' ')
    .replace(/[''`´]/g, '')
    .replace(/[^\w.\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/ /g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+|\.+$/g, '');

  return cleaned || fallback;
}

/**
 * Download / email attachment filename:
 * Physical-Risk-Security-Cost-Leakage-[Company-Name]-[Date].pdf
 * Never prefers opaque assessment refs like SCL-2026-000003 when a company name exists.
 */
export function buildSclReportFileName(input: SclReportFileNameInput): string {
  const brand = input.brand || DEFAULT_SCL_REPORT_BRANDING;
  const companyRaw = String(input.companyName || '').trim();
  const referenceRaw = String(input.reference || '').trim();
  const looksLikeOpaqueRef = /^SCL[I]?[-_]?\d/i.test(companyRaw) || /-\d{4,}$/.test(companyRaw);
  const companySegment = sanitizeReportFileNameSegment(
    companyRaw && !looksLikeOpaqueRef ? companyRaw : referenceRaw && !/^SCL[I]?[-_]?\d/i.test(referenceRaw)
      ? referenceRaw
      : companyRaw || 'Assessment',
    'Assessment',
  );

  const date = input.assessmentDate ? new Date(input.assessmentDate) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const dateSegment = formatAssessmentDateIso(safeDate);

  return `${brand.fileNameProductSegment}-${companySegment}-${dateSegment}.pdf`;
}
