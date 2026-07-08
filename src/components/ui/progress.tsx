import * as React from "react";

import { cn } from "@/lib/utils";

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: number;
  label?: string;
  indeterminate?: boolean;
};

export function Progress({ value = 0, label = "Progress", indeterminate = false, className, ...props }: ProgressProps) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : 100}
      aria-valuenow={indeterminate ? undefined : Math.round(normalized)}
      className={cn("h-2 overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full bg-primary transition-[transform,width] duration-300 ease-out",
          indeterminate && "progress-indeterminate w-1/3"
        )}
        style={indeterminate ? undefined : { width: `${normalized}%` }}
      />
    </div>
  );
}
