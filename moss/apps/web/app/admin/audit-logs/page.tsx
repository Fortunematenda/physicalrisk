import { redirect } from 'next/navigation';

export default function AuditLogsRedirect() {
  redirect('/settings?tab=system#audit-logs');
}
