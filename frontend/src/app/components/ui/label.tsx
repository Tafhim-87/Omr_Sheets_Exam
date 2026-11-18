import * as React from "react";
import { cx } from "../../lib/utils";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("label", className)} {...props} />;
}