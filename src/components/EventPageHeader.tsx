import { ReactNode } from 'react';

type EventBranding = {
  title: string;
  emojiLeft: string;
  emojiRight: string;
};

interface EventPageHeaderProps {
  eventBranding: EventBranding;
  pageLabel: string;
  subtitle: string;
  children?: ReactNode;
}

export default function EventPageHeader({
  eventBranding,
  pageLabel,
  subtitle,
  children,
}: EventPageHeaderProps) {
  return (
    <header className="text-center mb-8 relative">
      <div className="header-gradient p-8">
        <div className="header-emoji header-emoji-left">{eventBranding.emojiLeft}</div>
        <div className="header-emoji header-emoji-right">{eventBranding.emojiRight}</div>
        <div className="pt-8 sm:pt-4">
          <h1 className="text-3xl md:text-4xl header-title mb-2">
            <span className="hidden sm:inline">
              {eventBranding.emojiLeft} {eventBranding.title} {pageLabel} {eventBranding.emojiRight}
            </span>
            <span className="sm:hidden">{pageLabel}</span>
          </h1>
          <p className="text-white/90">{subtitle}</p>
        </div>
      </div>
      {children}
    </header>
  );
}
