'use client';

import { useWaveStore } from '@/store/waveStore';

interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message = 'Loading...' }: LoadingStateProps) {
  const { themeColors } = useWaveStore();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div
          className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4"
          style={{ borderBottomColor: themeColors.accent }}
        ></div>
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
}
