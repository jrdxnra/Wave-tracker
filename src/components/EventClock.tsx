'use client';

import { useState, useEffect, useRef } from 'react';

interface EventClockProps {
  eventStartDate: string; // "YYYY-MM-DD" format
  eventStartTime: string; // "HH:mm" format
  intervalMinutes: number;
  workMinutes: number;
  restMinutes: number;
  totalWaves: number;
  alertSettings: {
    workRestTransitions: boolean;
    eventStartEnd: boolean;
    soundType: 'beep';
    visualEffect: 'flash';
  };
  enableAlerts?: boolean; // Only play alerts when true
}

export default function EventClock({
  eventStartDate,
  eventStartTime,
  intervalMinutes,
  workMinutes,
  restMinutes,
  totalWaves,
  alertSettings,
  enableAlerts = true
}: EventClockProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [eventStatus, setEventStatus] = useState<'before' | 'during' | 'after'>('before');
  const [currentPeriod, setCurrentPeriod] = useState<'work' | 'rest'>('work');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationType, setAnimationType] = useState<'start' | 'end' | 'transition' | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasPlayedEventStartRef = useRef(false);
  const hasPlayedEventEndRef = useRef(false);
  const lastBeepSecondRef = useRef<number>(-1);

  // Parse event start date and time
  const getEventStartDate = () => {
    // Safety check for undefined values while loading from Firebase
    if (!eventStartTime || !eventStartDate) {
      return new Date();
    }
    const [hours, minutes] = eventStartTime.split(':').map(Number);
    const [year, month, day] = eventStartDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    return startDate;
  };

  // Calculate event end time
  const getEventEndDate = () => {
    const startDate = getEventStartDate();
    const totalMinutes = totalWaves * intervalMinutes;
    return new Date(startDate.getTime() + totalMinutes * 60 * 1000);
  };

  // Initialize audio context on first user interaction (iOS requirement)
  const initAudioContext = () => {
    if (typeof window === 'undefined') return;
    
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    // Resume context if suspended (iOS requirement)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().then(() => {
        setAudioEnabled(true);
      });
    } else {
      setAudioEnabled(true);
    }
  };

  // Manual audio enable for iOS
  const handleEnableAudio = () => {
    initAudioContext();
    // Play a test beep
    setTimeout(() => {
      playSound('beep', 1000, 200);
    }, 100);
  };

  // Play sound
  const playSound = (type: 'beep' | 'airhorn' | 'countdown', frequency: number = 800, duration: number = 150) => {
    if (typeof window === 'undefined' || !enableAlerts) return;
    
    // Initialize audio context if needed
    initAudioContext();
    
    if (!audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
    
    // Resume if suspended (iOS fix)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    if (type === 'airhorn') {
      // Air horn simulation: low frequency, loud
      oscillator.frequency.value = 200;
      gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.type = 'square';
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } else if (type === 'countdown') {
      // Countdown beeps
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration / 1000);
    } else {
      // Regular beep
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration / 1000);
    }
  };

  // Trigger animation
  const triggerAnimation = (type: 'start' | 'end' | 'transition') => {
    if (!enableAlerts) return;
    setAnimationType(type);
    setShowAnimation(true);
    setTimeout(() => {
      setShowAnimation(false);
      setAnimationType(null);
    }, 1000);
  };

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Initialize audio on mount and on any user interaction (iOS fix)
  useEffect(() => {
    const handleUserInteraction = () => {
      initAudioContext();
    };
    
    // Listen for any user interaction to unlock audio on iOS
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    document.addEventListener('click', handleUserInteraction, { once: true });
    
    return () => {
      document.removeEventListener('touchstart', handleUserInteraction);
      document.removeEventListener('click', handleUserInteraction);
    };
  }, []);

  // Calculate event status and timing
  useEffect(() => {
    const startDate = getEventStartDate();
    const endDate = getEventEndDate();
    const now = currentTime;

    // Determine event status
    if (now < startDate) {
      setEventStatus('before');
      const msUntilStart = startDate.getTime() - now.getTime();
      const secondsUntilStart = Math.floor(msUntilStart / 1000);
      setTimeRemaining(secondsUntilStart);

      // Event start countdown (15 minutes)
      if (alertSettings.eventStartEnd) {
        const minutesUntilStart = Math.floor(secondsUntilStart / 60);
        if (minutesUntilStart === 15 && secondsUntilStart % 60 === 0 && !hasPlayedEventStartRef.current) {
          playSound('beep', 1000, 200);
        }
        // 10 seconds before event
        if (secondsUntilStart <= 10 && secondsUntilStart > 0 && secondsUntilStart !== lastBeepSecondRef.current) {
          playSound('countdown', 1000 + secondsUntilStart * 50, 100);
          lastBeepSecondRef.current = secondsUntilStart;
        }
        // Event start!
        if (secondsUntilStart === 0 && !hasPlayedEventStartRef.current) {
          playSound('airhorn');
          triggerAnimation('start');
          hasPlayedEventStartRef.current = true;
        }
      }
    } else if (now >= startDate && now < endDate) {
      setEventStatus('during');
      
      // Calculate elapsed time since start
      const msElapsed = now.getTime() - startDate.getTime();
      const secondsElapsed = Math.floor(msElapsed / 1000);
      
      // Calculate position within interval
      const intervalSeconds = intervalMinutes * 60;
      const workSeconds = workMinutes * 60;
      const restSeconds = restMinutes * 60;
      
      const positionInInterval = secondsElapsed % intervalSeconds;
      
      if (positionInInterval < workSeconds) {
        // Work period
        setCurrentPeriod('work');
        const workRemaining = workSeconds - positionInInterval;
        setTimeRemaining(workRemaining);
        
        // Work ending countdown (5 seconds)
        if (alertSettings.workRestTransitions && workRemaining <= 5 && workRemaining > 0 && workRemaining !== lastBeepSecondRef.current) {
          playSound('countdown', 1000, 100);
          lastBeepSecondRef.current = workRemaining;
        }
        if (alertSettings.workRestTransitions && workRemaining === 0 && lastBeepSecondRef.current !== 0) {
          triggerAnimation('transition');
          lastBeepSecondRef.current = 0;
        }
      } else {
        // Rest period
        setCurrentPeriod('rest');
        const restRemaining = intervalSeconds - positionInInterval;
        setTimeRemaining(restRemaining);
        
        // Rest ending countdown (5 seconds)
        if (alertSettings.workRestTransitions && restRemaining <= 5 && restRemaining > 0 && restRemaining !== lastBeepSecondRef.current) {
          playSound('countdown', 1200, 100);
          lastBeepSecondRef.current = restRemaining;
        }
        if (alertSettings.workRestTransitions && restRemaining === 0 && lastBeepSecondRef.current !== 0) {
          triggerAnimation('transition');
          lastBeepSecondRef.current = 0;
        }
      }
    } else {
      setEventStatus('after');
      setTimeRemaining(0);
      
      // Event end
      if (alertSettings.eventStartEnd && !hasPlayedEventEndRef.current) {
        playSound('airhorn');
        triggerAnimation('end');
        hasPlayedEventEndRef.current = true;
      }
    }
  }, [currentTime, eventStartDate, eventStartTime, intervalMinutes, workMinutes, restMinutes, totalWaves, alertSettings]);

  // Format time
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatCountdown = (seconds: number, isBeforeEvent: boolean = false) => {
    if (isBeforeEvent) {
      // For countdown to event start, show days/hours/minutes if more than 1 day away
      const days = Math.floor(seconds / 86400); // 86400 seconds in a day
      const hours = Math.floor((seconds % 86400) / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      
      if (days > 0) {
        // Show days and hours when more than 1 day away
        if (hours > 0) {
          return `${days} day${days > 1 ? 's' : ''}, ${hours} hour${hours > 1 ? 's' : ''}`;
        }
        return `${days} day${days > 1 ? 's' : ''}`;
      } else if (hours > 0) {
        // Show hours and minutes when less than 1 day but more than 1 hour
        return `${hours} hour${hours > 1 ? 's' : ''}, ${mins} min`;
      } else {
        // Show minutes and seconds when less than 1 hour
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      }
    } else {
      // For work/rest periods, show minutes:seconds
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
  };

  // Get background gradient based on state
  const getBackgroundClass = () => {
    if (eventStatus === 'before') return 'from-blue-700 to-blue-600';
    if (eventStatus === 'after') return 'from-green-700 to-green-600';
    if (currentPeriod === 'work') {
      if (timeRemaining <= 5) return 'from-red-600 to-red-500';
      if (timeRemaining <= 10) return 'from-yellow-600 to-yellow-500';
      return 'from-orange-700 to-orange-600';
    }
    if (currentPeriod === 'rest') {
      if (timeRemaining <= 5) return 'from-yellow-600 to-yellow-500';
      return 'from-blue-700 to-blue-600';
    }
    return 'from-slate-700 to-slate-600';
  };

  // Get scale/pulse effects
  const getAnimationClass = () => {
    if (!showAnimation) return 'scale-100';
    if (alertSettings.visualEffect === 'flash') return 'animate-pulse';
    if (alertSettings.visualEffect === 'expand') return 'scale-110';
    return 'scale-110 animate-pulse';
  };

  const getPulseClass = () => {
    if (eventStatus === 'during' && timeRemaining <= 3) return 'animate-pulse';
    return '';
  };

  // Format date for display
  const formatEventDate = () => {
    const startDate = getEventStartDate();
    return startDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Status text
  const getStatusText = () => {
    if (eventStatus === 'before') {
      return `Event starts ${formatEventDate()} at ${eventStartTime}`;
    }
    if (eventStatus === 'after') {
      return 'Event Complete! 🎉';
    }
    return currentPeriod === 'work' ? '💪 WORK TIME' : '😌 REST TIME';
  };

  return (
    <div className="w-full mb-8">
      <div className={`relative transition-all duration-300 ${getAnimationClass()}`}>
        <div 
          className={`
            bg-gradient-to-r ${getBackgroundClass()} 
            rounded-2xl shadow-2xl p-6 
            transition-all duration-300
            ${getPulseClass()}
          `}
        >
          {/* Enable Audio Button for iOS */}
          {!audioEnabled && enableAlerts && (
            <div className="text-center mb-4">
              <button
                onClick={handleEnableAudio}
                className="px-4 py-2 bg-white/20 text-white rounded-lg text-sm hover:bg-white/30 transition-colors border border-white/30"
              >
                🔊 Enable Audio Alerts
              </button>
            </div>
          )}

          {/* Current Time Display */}
          <div className="text-center mb-4">
            <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-wide font-mono">
              {formatTime(currentTime)}
            </div>
          </div>

          {/* Status and Countdown */}
          <div className="text-center border-t border-white/20 pt-4">
            <div className="text-xl md:text-2xl text-white/90 font-semibold mb-2">
              {getStatusText()}
            </div>
            {eventStatus !== 'after' && (
              <div className="text-4xl md:text-5xl font-bold text-white font-mono">
                {formatCountdown(timeRemaining, eventStatus === 'before')}
                <span className="text-xl ml-2 text-white/80">
                  {eventStatus === 'before' ? 'until start' : 'remaining'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


