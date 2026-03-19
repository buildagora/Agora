import React from "react";

interface TopbarProps {
  children: React.ReactNode;
  className?: string;
}

export default function Topbar({ children, className = "" }: TopbarProps) {
  return (
    <div className={`w-full bg-white border-b border-zinc-200 px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}







