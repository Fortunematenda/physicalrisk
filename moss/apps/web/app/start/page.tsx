import { Loader2 } from 'lucide-react';
import { Suspense } from 'react';

import { SclAssessmentShell } from '@/components/scl/SclAssessmentShell';

import StartAssessmentClient from './StartClient';

function StartLoadingFallback() {
  return (
    <SclAssessmentShell>
      <div className="scl-exec-shell" style={{ padding: '80px 0', textAlign: 'center' }}>
        <Loader2 className="inline size-6 animate-spin" aria-hidden="true" />
        <p style={{ marginTop: 16, color: '#666', fontSize: 14 }}>Loading assessment…</p>
      </div>
    </SclAssessmentShell>
  );
}

export default function StartPage() {
  return (
    <Suspense fallback={<StartLoadingFallback />}>
      <StartAssessmentClient />
    </Suspense>
  );
}
