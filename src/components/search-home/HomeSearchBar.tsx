"use client";

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export default function HomeSearchBar({
  value,
  onDraftChange,
  onSend,
  disabled,
}: {
  value: string;
  onDraftChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const submit = () => {
    if (!disabled && value.trim()) onSend();
  };

  const submitDisabled = disabled || !value.trim();

  return (
    <div className="flex w-full items-center gap-3 rounded-full border border-transparent bg-white px-4 py-2.5 shadow-lg shadow-[#1E3A5F]/10 transition-[box-shadow,ring-color] focus-within:border-[#1E3A5F]/20 focus-within:shadow-xl focus-within:shadow-[#1E3A5F]/15 focus-within:ring-2 focus-within:ring-[#1E3A5F]/12 sm:gap-4 sm:px-5 sm:py-3">
      <SearchIcon className="h-5 w-5 shrink-0 text-zinc-400 sm:h-[22px] sm:w-[22px]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Search for materials, products, brands, or categories..."
        className="min-w-0 flex-1 bg-transparent py-1 text-base text-zinc-900 outline-none placeholder:text-zinc-400 sm:text-[17px]"
        disabled={disabled}
        aria-label="Search for materials"
      />
      <button
        type="button"
        onClick={submit}
        disabled={submitDisabled}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1E3A5F] text-white shadow-sm shadow-[#1E3A5F]/25 transition hover:bg-[#172e4c] disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none"
        aria-label="Search"
      >
        <SearchIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
