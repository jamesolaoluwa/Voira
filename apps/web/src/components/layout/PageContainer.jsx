import React from 'react';

// Simple layout wrapper to keep horizontal rhythm and max width consistent across pages.
// API: <PageContainer className="...">children</PageContainer>
export default function PageContainer({ children, className = '' }) {
  return (
    <div className={`w-full mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`.trim()}>
      {children}
    </div>
  );
}
