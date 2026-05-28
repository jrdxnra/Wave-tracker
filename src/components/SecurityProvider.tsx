'use client';

import { useEffect } from 'react';
import { initSecurity } from '@/lib/security';

export default function SecurityProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize security measures on client side
    initSecurity();
  }, []);

  return <>{children}</>;
}


