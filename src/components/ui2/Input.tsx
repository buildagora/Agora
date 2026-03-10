import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export default function Input({ className = "", label, error, helperText, ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-black dark:text-zinc-50 mb-2">
          {label}
        </label>
      )}
      <input
        className={`w-full px-3 py-2 border ${
          error ? "border-red-300 dark:border-red-700" : "border-zinc-300 dark:border-zinc-700"
        } rounded-md bg-white dark:bg-zinc-900 text-black dark:text-zinc-50 placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-slate-500 dark:focus:ring-slate-400 ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {!error && helperText && (
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{helperText}</p>
      )}
    </div>
  );
}

