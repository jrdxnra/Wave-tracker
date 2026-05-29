'use client';

import { useEffect } from 'react';
import { useWaveStore } from '@/store/waveStore';

export default function BrandingThemeProvider() {
  const { themeColors } = useWaveStore();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-start', themeColors.start);
    root.style.setProperty('--brand-mid', themeColors.mid);
    root.style.setProperty('--brand-end', themeColors.end);
    root.style.setProperty('--brand-accent', themeColors.accent);
    root.style.setProperty('--brand-accent-hover', themeColors.accentHover);
  }, [themeColors]);

  return null;
}
