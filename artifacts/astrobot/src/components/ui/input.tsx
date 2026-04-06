import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps extends React.ComponentProps<"input"> {
  icon?: React.ReactNode
}

const inputClassName =
  "flex w-full rounded-xl border border-white/10 bg-card/45 backdrop-blur-md px-4 py-3.5 text-base text-foreground shadow-sm transition-all duration-300 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, ...props }, ref) => {
    if (icon) {
      return (
        <div className="relative flex w-full items-center">
          <span
            className="pointer-events-none absolute left-3.5 flex text-muted-foreground [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary/85"
            aria-hidden
          >
            {icon}
          </span>
          <input
            type={type}
            className={cn(inputClassName, "pl-12", className)}
            ref={ref}
            {...props}
          />
        </div>
      )
    }

    return (
      <input
        type={type}
        className={cn(inputClassName, className)}
        ref={ref}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input }
