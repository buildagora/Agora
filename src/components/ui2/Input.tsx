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
        <label className="block text-sm font-medium text-black mb-2">
          {label}
        </label>
      )}
      <input
        className={`w-full px-3 py-2 border ${
          error ? "border-red-300" : "border-zinc-300"
        } rounded-md bg-white text-black placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-slate-500 ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
      {!error && helperText && (
        <p className="mt-1 text-sm text-zinc-500">{helperText}</p>
      )}
    </div>
  );
}

