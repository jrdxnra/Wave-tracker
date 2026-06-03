'use client';

import { useState, useEffect } from 'react';
import { useWaveStore } from '@/store/waveStore';
import LoadingState from '@/components/LoadingState';

interface PasscodeProtectionProps {
  children: React.ReactNode;
  requiredPasscode: string;
}

export default function PasscodeProtection({ children, requiredPasscode }: PasscodeProtectionProps) {
  const { passcodeProtectionEnabled, themeColors } = useWaveStore();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!passcodeProtectionEnabled) {
      setIsAuthenticated(true);
      setIsLoading(false);
      return;
    }

    // Check if already authenticated in this session
    const sessionAuth = sessionStorage.getItem('wavetracker_auth');
    if (sessionAuth === 'authenticated') {
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, [passcodeProtectionEnabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passcode === requiredPasscode) {
      setIsAuthenticated(true);
      sessionStorage.setItem('wavetracker_auth', 'authenticated');
      setError('');
    } else {
      setError('Incorrect passcode. Please try again.');
      setPasscode('');
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading..." />;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="text-4xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Protected Page</h2>
            <p className="text-gray-600">Please enter the passcode to access this page</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ boxShadow: 'none' }}
                autoFocus
              />
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            
            <button
              type="submit"
              className="w-full text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
              style={{ backgroundColor: themeColors.accent }}
            >
              Submit
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <a 
              href="/leaderboard" 
              className="text-sm font-medium"
              style={{ color: themeColors.accent }}
            >
              View Public Leaderboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


