'use client';

import { useState } from 'react';

interface FloatingHamburgerMenuProps {
  onSettingsClick: () => void;
  currentPage: 'wave' | 'leaderboard' | 'performance';
}

export default function FloatingHamburgerMenu({ onSettingsClick, currentPage }: FloatingHamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const navigateTo = (path: string) => {
    setIsOpen(false);
    window.location.assign(path);
  };

  const menuItems = [
    {
      id: 'config',
      label: 'Settings',
      icon: '⚙️',
      onClick: () => {
        onSettingsClick();
        setIsOpen(false);
      },
      color: 'hover:bg-gray-600 text-gray-600 hover:text-white'
    },
    // Show navigation based on current page
    ...(currentPage === 'wave' ? [
      {
        id: 'performance',
        label: 'Performance',
        icon: '📊',
        onClick: () => navigateTo('/performance'),
        color: 'hover:bg-blue-500 text-blue-600 hover:text-white'
      },
      {
        id: 'leaderboard',
        label: 'Leaderboard',
        icon: '🏆',
        onClick: () => navigateTo('/leaderboard'),
        color: 'hover:bg-yellow-500 text-yellow-600 hover:text-white'
      }
    ] : currentPage === 'performance' ? [
      {
        id: 'waves',
        label: 'Wave Config',
        icon: '🌊',
        onClick: () => navigateTo('/'),
        color: 'hover:bg-blue-500 text-blue-600 hover:text-white'
      },
      {
        id: 'leaderboard',
        label: 'Leaderboard',
        icon: '🏆',
        onClick: () => navigateTo('/leaderboard'),
        color: 'hover:bg-yellow-500 text-yellow-600 hover:text-white'
      }
    ] : [
      {
        id: 'performance',
        label: 'Performance',
        icon: '📊',
        onClick: () => navigateTo('/performance'),
        color: 'hover:bg-blue-500 text-blue-600 hover:text-white'
      },
      {
        id: 'waves',
        label: 'Wave Config',
        icon: '🌊',
        onClick: () => navigateTo('/'),
        color: 'hover:bg-blue-500 text-blue-600 hover:text-white'
      }
    ])
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-row items-end gap-1">
      {/* Menu Items and Hamburger */}
      <div className="flex flex-col items-end justify-end gap-1">
        {/* Menu Items - Expand upward above hamburger */}
        <div className={`flex flex-col-reverse gap-3 mb-4 transition-all duration-500 ${isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`
                group-hover:rounded-lg group-hover:opacity-100 p-3 bg-white 
                shadow-2xl rounded-lg flex items-center justify-center w-12 h-12 
                ring-1 ring-black/10
                ${item.color} duration-200 transition-all
              `}
              title={item.label}
            >
              <span className="text-lg">{item.icon}</span>
            </button>
          ))}
        </div>
        {/* Hamburger Button */}
        <div
          className="group cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div
            className="w-12 h-12 rounded-lg shadow-2xl ring-1 ring-black/10 flex items-center justify-center transition-all duration-200"
            style={{ backgroundColor: 'var(--brand-accent)' }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              height="24"
              width="24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="w-6 h-6 text-white transition-transform duration-200"
              style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              <path
                d="M5 7h14M5 12h14M5 17h14"
                strokeWidth="2"
                strokeLinecap="round"
                stroke="currentColor"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}


