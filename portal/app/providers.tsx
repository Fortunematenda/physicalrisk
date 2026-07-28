'use client';

import { SessionProvider as NextAuthSessionProvider, useSession } from 'next-auth/react';
import { useCallback } from 'react';
import { IdleSessionGuard } from '../components/IdleSessionGuard';

function IdleLogoutBridge() {
  const { status } = useSession();
  const onTimeout = useCallback(() => {
    window.location.replace('/api/auth/federated-logout');
  }, []);
  return <IdleSessionGuard enabled={status === 'authenticated'} onTimeout={onTimeout} />;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider>
      <IdleLogoutBridge />
      {children}
    </NextAuthSessionProvider>
  );
}
