import * as React from "react";
import { cx } from "../../lib/utils";

export function Badge({
  variant = "default",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "danger" | "info";
}) {
  return <span className={cx("badge", `badge-${variant}`, className)} {...props} />;
}