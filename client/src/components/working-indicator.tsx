import { useEffect, useState } from "react";

interface WorkingIndicatorProps {
  text?: string;
  showDots?: boolean;
}

export function WorkingIndicator({ text = "Working", showDots = true }: WorkingIndicatorProps) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!showDots) return;
    
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 2) return "";
        return prev + ".";
      });
    }, 400);

    return () => clearInterval(interval);
  }, [showDots]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-5 h-5">
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            className="w-5 h-5 animate-spin-slow"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
        </div>
      </div>
      <span className="text-sm font-medium text-primary">
        {text}{showDots ? dots : ""}
      </span>
    </div>
  );
}

export function ReplitLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg 
      className={`${className} animate-pulse-gentle`} 
      viewBox="0 0 32 32" 
      fill="none"
    >
      <g>
        <path
          d="M7 5.5C7 4.67157 7.67157 4 8.5 4H15.5C16.3284 4 17 4.67157 17 5.5V12H8.5C7.67157 12 7 11.3284 7 10.5V5.5Z"
          className="fill-orange-500"
        />
        <path
          d="M17 12H25.5C26.3284 12 27 12.6716 27 13.5V18.5C27 19.3284 26.3284 20 25.5 20H17V12Z"
          className="fill-blue-500"
        />
        <path
          d="M7 21.5C7 20.6716 7.67157 20 8.5 20H17V26.5C17 27.3284 16.3284 28 15.5 28H8.5C7.67157 28 7 27.3284 7 26.5V21.5Z"
          className="fill-indigo-500"
        />
        <path
          d="M17 12V20H8.5C7.67157 20 7 19.3284 7 18.5V13.5C7 12.6716 7.67157 12 8.5 12H17Z"
          className="fill-yellow-500"
        />
      </g>
    </svg>
  );
}
