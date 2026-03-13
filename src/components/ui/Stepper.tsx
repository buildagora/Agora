"use client";

import React from "react";

interface StepperProps {
  steps: string[];
  currentStep: number;
}

/**
 * Stepper component for multi-step forms
 * Displays a horizontal progress indicator with step labels
 */
export default function Stepper({ steps, currentStep }: StepperProps) {
  return (
    <div className="flex items-center justify-between w-full">
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        
        return (
          <React.Fragment key={index}>
            <div className="flex flex-col items-center flex-1">
              {/* Step Circle */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  isCompleted
                    ? "bg-black dark:bg-zinc-50 text-white dark:text-black"
                    : isActive
                    ? "bg-black dark:bg-zinc-50 text-white dark:text-black ring-2 ring-black dark:ring-zinc-50"
                    : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                }`}
              >
                {isCompleted ? (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  stepNumber
                )}
              </div>
              
              {/* Step Label */}
              <div className="mt-2 text-xs font-medium text-center">
                <span
                  className={
                    isActive || isCompleted
                      ? "text-black dark:text-zinc-50"
                      : "text-zinc-500 dark:text-zinc-400"
                  }
                >
                  {step}
                </span>
              </div>
            </div>
            
            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 transition-colors ${
                  isCompleted
                    ? "bg-zinc-300 dark:bg-zinc-600"
                    : "bg-zinc-200 dark:bg-zinc-800"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}





