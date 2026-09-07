import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // `before:` overlay sweeps in from the left on hover (scaleX 0 -> 1,
  // origin-left), fully opaque, painted in each variant's "inverted" color
  // (the --invert-bg custom property below) — a real background swap, not
  // just a darken. It sits at a negative z-index within this element's own
  // isolated stacking context: per CSS stacking order, a negative-z-index
  // layer paints above the element's own background but below its in-flow
  // text content, so the background swap works identically for `bg-*`
  // Tailwind classes AND inline `style={{ backgroundColor: ... }}`
  // overrides (which many marketing CTAs use for exact brand hex values)
  // without needing every button usage to change.
  // Text color inverts via --invert-fg with an `!important` hover rule —
  // needed specifically because inline `style={{ color: ... }}` (also used
  // by those same CTAs) would otherwise always beat a plain Tailwind hover
  // class, `!important` or not on the class, since inline style outranks
  // any stylesheet rule except an `!important` one.
  // Buttons that set their own inline bg/text colors can opt into a
  // correctly-matched invert by also setting the --invert-bg/--invert-fg
  // custom properties in that same style object; otherwise they fall back
  // to whichever variant they're using, which is already color-correct for
  // the common case since --primary IS the brand teal these CTAs use.
  // motion-reduce respects the OS-level reduced-motion preference.
  "group/button relative isolate inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none before:absolute before:inset-0 before:-z-10 before:origin-left before:scale-x-0 before:bg-[var(--invert-bg)] before:transition-transform before:duration-500 before:ease-out hover:before:scale-x-100 hover:!text-[var(--invert-fg)] motion-reduce:before:transition-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [--invert-bg:var(--primary-foreground)] [--invert-fg:var(--primary)]",
        outline:
          "border-border bg-background text-foreground [--invert-bg:var(--foreground)] [--invert-fg:var(--background)] aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30",
        secondary:
          "bg-secondary text-secondary-foreground [--invert-bg:var(--secondary-foreground)] [--invert-fg:var(--secondary)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "text-foreground [--invert-bg:var(--foreground)] [--invert-fg:var(--background)] aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive [--invert-bg:var(--destructive)] [--invert-fg:var(--background)] focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        // Plain text link, not a boxed button — the sweep/invert would
        // look like a stray highlight box behind inline text, so it's
        // switched off here via before:content-none (no pseudo-element
        // is generated at all) and no forced hover text color.
        link: "text-primary underline-offset-4 hover:underline before:content-none hover:!text-primary",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...(props as ButtonPrimitive.Props)}
    />
  )
}

export { Button, buttonVariants }
