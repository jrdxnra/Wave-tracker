'use client';

import { useState, useEffect } from 'react';

interface EventTimelineProps {
  eventStartDate: string; // "YYYY-MM-DD" format
  eventStartTime: string; // "HH:mm" format
  intervalMinutes: number; // Time between wave starts
  workMinutes: number;
  restMinutes: number;
  totalWaves: number;
  totalMovements: number;
}

export default function EventTimeline({
  eventStartDate,
  eventStartTime,
  intervalMinutes,
  workMinutes,
  restMinutes,
  totalWaves,
  totalMovements
}: EventTimelineProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [progress, setProgress] = useState(0);

  // Update time every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate progress
  useEffect(() => {
    // Safety check for undefined values while loading from Firebase
    if (!eventStartTime || !eventStartDate) {
      setProgress(0);
      return;
    }
    
    // Parse the event start date and time properly
    const [hours, minutes] = eventStartTime.split(':').map(Number);
    const [year, month, day] = eventStartDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

    // Calculate end time:
    // Last wave starts at: start + ((totalWaves - 1) × intervalMinutes)
    // Event ends at: last wave start + (totalMovements × (work + rest))
    const lastWaveStartMinutes = (totalWaves - 1) * intervalMinutes;
    const movementDuration = totalMovements * (workMinutes + restMinutes);
    const totalMinutes = lastWaveStartMinutes + movementDuration;
    const endDate = new Date(startDate.getTime() + totalMinutes * 60 * 1000);

    const now = currentTime;

    if (now < startDate) {
      setProgress(0);
    } else if (now >= endDate) {
      setProgress(100);
    } else {
      const elapsed = now.getTime() - startDate.getTime();
      const total = endDate.getTime() - startDate.getTime();
      const percentage = (elapsed / total) * 100;
      setProgress(Math.min(100, Math.max(0, percentage)));
    }
  }, [currentTime, eventStartDate, eventStartTime, intervalMinutes, workMinutes, restMinutes, totalWaves, totalMovements]);

  const formatTime = (timeStr: string) => {
    // Safety check for undefined values while loading from Firebase
    if (!timeStr) {
      return '--:--';
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getEndTime = () => {
    // Safety check for undefined values while loading from Firebase
    if (!eventStartTime || !eventStartDate) {
      return '--:--';
    }
    // Parse the event start date and time properly
    const [hours, minutes] = eventStartTime.split(':').map(Number);
    const [year, month, day] = eventStartDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
    
    // Calculate end time correctly:
    // Last wave starts at: start + ((totalWaves - 1) × intervalMinutes)
    // Event ends at: last wave start + (totalMovements × (work + rest))
    const lastWaveStartMinutes = (totalWaves - 1) * intervalMinutes;
    const movementDuration = totalMovements * (workMinutes + restMinutes);
    const totalMinutes = lastWaveStartMinutes + movementDuration;
    const endDate = new Date(startDate.getTime() + totalMinutes * 60 * 1000);
    
    return endDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="flex justify-between items-center mb-2">
        <div className="text-sm font-medium text-gray-700">
          Event Timeline
        </div>
        <div className="text-xs text-gray-500">
          {formatTime(eventStartTime)} - {getEndTime()}
        </div>
      </div>
      
      <div className="relative w-full h-4 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full transition-all duration-1000 ease-linear"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(to right, var(--brand-mid), var(--brand-start))',
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold text-gray-700">
            {progress.toFixed(1)}%
          </span>
        </div>
      </div>
      
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
        <div>Start</div>
        <div>{totalWaves} Waves</div>
        <div>End</div>
      </div>
    </div>
  );
}


