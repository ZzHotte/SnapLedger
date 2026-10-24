import { type ButtonHTMLAttributes, type AnchorHTMLAttributes } from "react";
import Link from "next/link";

// The one place button styling is decided — every clickable action in the app
// should use this (or NavTab/SegmentedControl for navigation/toggles) instead
// of ad hoc classes, so "is this clickable?" has one consistent answer.
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black";

const sizes: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-2 text-sm",
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-black text-white hover:bg-gray-800",
  secondary: "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  danger: "text-red-600 hover:bg-red-50",
};

function classes(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return [base, sizes[size], variants[variant], className].filter(Boolean).join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return <button className={classes(variant, size, className)} {...props} />;
}

interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({ variant = "secondary", size = "md", className, href, ...props }: ButtonLinkProps) {
  return <Link href={href} className={classes(variant, size, className)} {...props} />;
}
