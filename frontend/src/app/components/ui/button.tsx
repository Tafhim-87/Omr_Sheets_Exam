import * as React from "react";
import { cx } from "../../lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cx(
          "btn",
          `btn-${variant}`,
          `btn-${size}`,
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";