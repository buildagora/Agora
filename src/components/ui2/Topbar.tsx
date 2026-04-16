import React from "react";

interface TopbarProps {
  children: React.ReactNode;
  className?: string;
}

export default function Topbar({ children, className = "" }: TopbarProps) {
  return (
    <div className={`w-full shrink-0 border-b border-zinc-200 bg-white ${className}`}>
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}







