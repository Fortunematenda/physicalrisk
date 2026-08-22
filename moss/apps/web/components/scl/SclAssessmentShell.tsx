'use client';

import { PhysicalRiskPublicHeader } from '@/components/PhysicalRiskPublicHeader';

export function SclAssessmentShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="scl-exec scl-exec--site-nav">
      <PhysicalRiskPublicHeader />
      <div className="scl-exec-body">{children}</div>
    </div>
  );
}
