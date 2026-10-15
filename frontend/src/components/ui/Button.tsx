import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-amd px-3.5 py-2 text-white hover:bg-amd-dark disabled:bg-track disabled:text-subtle",
  ghost: "border border-line px-3.5 py-2 text-fg hover:bg-hover disabled:text-subtle",
  icon: "h-10 w-10 text-soft hover:bg-hover hover:text-strong",
};

export type ButtonProps = HTMLMotionProps<"button"> & { variant?: Variant };

/** The app's one button. Gentle press effect; disabled buttons don't animate. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className = "", disabled, type = "button", ...props }, ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed max-md:min-h-11 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
});
