import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Base button styles with elevate system for hover/active states.
  // hover-elevate: applies subtle dark overlay on hover
  // active-elevate-2: applies stronger dark overlay when pressed
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
          // Solid primary button with computed border for depth
          "bg-primary text-primary-foreground border border-primary-border",
        destructive:
          // Destructive action button with matching border
          "bg-destructive text-destructive-foreground border border-destructive-border",
        outline:
          // Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color.
          "border [border-color:var(--button-outline)] shadow-xs active:shadow-none",
        secondary:
          // Subtle filled button for secondary actions
          "bg-secondary text-secondary-foreground border border-secondary-border",
        // Add a transparent border so that when someone toggles a border on later, it doesn't shift layout/size.
        ghost: "border border-transparent",
      },
      // Heights are set as "min" heights, because sometimes AI will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  fx,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** 按压词汇档位：默认按 variant 挑（实心=strong，其余=soft）；"none" 完全不参与 */
    fx?: "strong" | "soft" | "none"
  }) {
  const Comp = asChild ? Slot : "button"
  /**
   * 词汇本身在 index.css（`[data-press]` + `--fx-*`），涟漪在 press-fx 的一处事件委托里。
   * asChild 时不能往别人家的节点里塞涟漪宿主，所以只留缩放。
   */
  const tone = fx ?? ((variant === "default" || variant === "destructive") ? "strong" : "soft")
  const fxA = fx === "none" ? {} : {
    "data-press": tone,
    ...(asChild ? { "data-fx-ripple": "0" } : {}),
  }

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...fxA}
      {...props}
    />
  )
}

export { Button, buttonVariants }
