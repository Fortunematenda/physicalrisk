export async function uploadTriageProposal(
  submissionId: string,
  file: File,
  title?: string,
): Promise<void> {
  const form = new FormData();
  form.append('file', file);
  if (title) form.append('title', title);
  const res = await fetch(`/api/gw/triage/submissions/${submissionId}/proposals/upload`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message =
      typeof err.message === 'string'
        ? err.message
        : Array.isArray(err.message)
          ? err.message.join(', ')
          : 'Upload failed.';
    throw new Error(message);
  }
}
