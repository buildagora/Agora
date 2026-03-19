import React, { useState } from "react";

interface TabsProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

export default function Tabs({ defaultValue, value, onValueChange, children, className = "" }: TabsProps) {
  const [internalActiveTab, setInternalActiveTab] = useState(defaultValue || "");
  const activeTab = value !== undefined ? value : internalActiveTab;
  const setActiveTab = onValueChange || setInternalActiveTab;
  
  return (
    <div className={className}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { activeTab, setActiveTab } as any);
        }
        return child;
      })}
    </div>
  );
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  activeTab?: string;
  setActiveTab?: (value: string) => void;
}

export function TabsList({ className = "", children, activeTab, setActiveTab, ...props }: TabsListProps) {
  return (
    <div
      className={`flex space-x-1 border-b border-zinc-200 ${className}`}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { activeTab, setActiveTab } as any);
        }
        return child;
      })}
    </div>
  );
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  children: React.ReactNode;
  activeTab?: string;
  setActiveTab?: (value: string) => void;
}

export function TabsTrigger({
  value,
  children,
  activeTab,
  setActiveTab,
  className = "",
  ...props
}: TabsTriggerProps) {
  const isActive = activeTab === value;
  
  return (
    <button
      onClick={() => setActiveTab?.(value)}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        isActive
          ? "border-slate-600 text-slate-900"
          : "border-transparent text-zinc-600 hover:text-zinc-900"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
  children: React.ReactNode;
  activeTab?: string;
  setActiveTab?: (value: string) => void;
}

export function TabsContent({
  value,
  children,
  activeTab,
  setActiveTab,
  className = "",
  ...props
}: TabsContentProps) {
  if (activeTab !== value) return null;
  
  return (
    <div className={`mt-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

