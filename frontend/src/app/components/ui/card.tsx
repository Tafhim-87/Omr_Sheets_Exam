import * as React from "react";
import { cx } from "../../lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("card", className)} {...props} />;
}
export function CardHeader(p: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="card-header" {...p} />;
}
export function CardContent(p: React.HTMLAttributes<HTMLDivElement>) {
  return <div className="card-content" {...p} />;
}