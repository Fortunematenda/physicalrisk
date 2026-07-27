import { redirect } from 'next/navigation';

/** Import Logs moved under Settings → Logs. */
export default function ImportLogsRedirectPage() {
  redirect('/settings/audit');
}
