"use client";

import React, { useState } from "react";

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
}

/**
 * Tooltip component - displays helpful information on hover
 */
export default function Tooltip({ content, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  if (children) {
    // Wrapper mode: wrap children and show tooltip on hover
    return (
      <div
        className="relative inline-block"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
        {isVisible && (
          <div className="absolute z-50 px-2 py-1 text-xs text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded shadow-lg whitespace-nowrap bottom-full left-1/2 transform -translate-x-1/2 mb-2">
            {content}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-100"></div>
          </div>
        )}
      </div>
    );
  }

  // Icon mode: show info icon with tooltip
  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <svg
        className="w-4 h-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-help"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {isVisible && (
        <div className="absolute z-50 px-2 py-1 text-xs text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded shadow-lg whitespace-nowrap bottom-full left-1/2 transform -translate-x-1/2 mb-2 max-w-xs">
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-100"></div>
        </div>
      )}
    </div>
  );
}





