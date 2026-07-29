import { ApiError } from './api-error';

/** Map API / transport errors to friendly UI copy. */
export function friendlyErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) {
    const code = (error.code || '').toUpperCase();
    const raw = (error.message || '').trim();
    const lower = raw.toLowerCase();

    if (error.status === 401 || lower.includes('invalid or expired token') || lower.includes('bearer token') || lower.includes('authentication required')) {
      return 'Your session has expired or is no longer valid. Refreshing your session…';
    }
    if (lower.includes('only approved') || lower.includes('approved documents') || code.includes('APPROVAL')) {
      return 'This document cannot be imported because it has not yet been approved.';
    }
    if (lower.includes('priority') && (lower.includes('already exists') || lower.includes('unique'))) {
      return raw;
    }
    if (lower.includes('directory template') || code.includes('TEMPLATE')) {
      return lower.includes('directory template') || lower.includes('template')
        ? raw
        : 'The selected directory template could not be updated. Please try again.';
    }
    if (lower.includes('routing') || code.includes('ROUTING')) {
      return raw || 'No matching repository section could be resolved. Choose a section or update routing rules.';
    }
    if (lower.includes('architecture doc') && lower.includes('not an active type')) {
      return 'Architecture Doc is not configured as an active document type. Ask an administrator to enable it, or choose Product Architecture / Enterprise Architecture.';
    }
    if (error.status >= 500) {
      // Prefer a concrete Nest/API message when present (helps ops diagnose live failures).
      if (raw && !/^internal server error$/i.test(raw) && raw.length < 280) {
        return raw;
      }
      return 'The server could not complete this request. Please try again. If it continues, contact an administrator.';
    }
    return raw || fallback;
  }
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    if (lower.includes('invalid or expired token')) {
      return 'Your session has expired or is no longer valid. Refreshing your session…';
    }
    if (lower.includes('failed to fetch') || lower.includes('network')) {
      return 'Unable to reach the repository service. Check your connection and try again.';
    }
    return error.message || fallback;
  }
  return fallback;
}
