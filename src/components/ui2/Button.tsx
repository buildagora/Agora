import React from "react";
import * as Slot from "@radix-ui/react-slot";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = "primary",
  size = "md",
  className = "",
  asChild = false,
  children,
  ...props
}, ref) => {
  const baseStyles = "font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2";
  
  const variantStyles = {
    primary: "bg-slate-600 text-white hover:bg-slate-700 focus:ring-slate-600",
    secondary: "bg-zinc-100 text-black hover:bg-zinc-200 focus:ring-zinc-500",
    outline: "border-2 border-slate-600 text-slate-700 hover:bg-slate-50 focus:ring-slate-600",
    ghost: "text-black hover:bg-zinc-100 focus:ring-zinc-500",
  };
  
  const sizeStyles = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-base",
    lg: "px-6 py-3 text-lg",
  };
  
  const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;
  
  if (asChild) {
    return (
      <Slot.Root
        ref={ref}
        className={combinedClassName}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }
  
  return (
    <button
      ref={ref}
      className={combinedClassName}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = "Button";

export default Button;

