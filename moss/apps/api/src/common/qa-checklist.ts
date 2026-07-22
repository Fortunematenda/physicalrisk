export const QA_CHECKLIST_TEMPLATE: Array<{ code: string; label: string; sortOrder: number }> = [
  { code: 'RESPONSES_COMPLETE', label: 'All mandatory responses are complete', sortOrder: 1 },
  { code: 'UNKNOWN_COMMENTS', label: 'All unknown answers have comments', sortOrder: 2 },
  { code: 'EVIDENCE_REVIEWED', label: 'Required evidence has been reviewed', sortOrder: 3 },
  { code: 'CRITICAL_FINDINGS', label: 'All critical findings have recommendations', sortOrder: 4 },
  { code: 'OVERRIDES_DECIDED', label: 'All score overrides have decisions', sortOrder: 5 },
  { code: 'LEAKAGE_CHECKED', label: 'Leakage inputs have been checked', sortOrder: 6 },
  { code: 'ANALYST_COMPLETE', label: 'Analyst review is complete', sortOrder: 7 },
  { code: 'REPORT_REVIEWED', label: 'Report content has been reviewed', sortOrder: 8 },
  { code: 'ORG_COMPLETE', label: 'Client and organisation information is complete', sortOrder: 9 },
];
