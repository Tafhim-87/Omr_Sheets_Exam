import * as React from "react";
import { cx } from "../../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cx("input", className)} {...props} />
);
Input.displayName = "Input";