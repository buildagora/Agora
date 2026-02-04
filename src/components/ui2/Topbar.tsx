import React from "react";

interface TopbarProps {
  children: React.ReactNode;
  className?: string;
}

export default function Topbar({ children, className = "" }: TopbarProps) {
  return (
    <div className={`w-full bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}




