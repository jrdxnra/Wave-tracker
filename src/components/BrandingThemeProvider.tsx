'use client';

import { useEffect } from 'react';
import { useWaveStore } from '@/store/waveStore';

function hexToRgbTuple(hex: string): string {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '234 88 12';
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `${r} ${g} ${b}`;
}

export default function BrandingThemeProvider() {
  const { themeColors } = useWaveStore();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--brand-start', themeColors.start);
    root.style.setProperty('--brand-mid', themeColors.mid);
    root.style.setProperty('--brand-end', themeColors.end);
    root.style.setProperty('--brand-accent', themeColors.accent);
    root.style.setProperty('--brand-accent-hover', themeColors.accentHover);
    root.style.setProperty('--brand-accent-rgb', hexToRgbTuple(themeColors.accent));
    root.style.setProperty('--brand-accent-hover-rgb', hexToRgbTuple(themeColors.accentHover));
  }, [themeColors]);

  return null;
}
