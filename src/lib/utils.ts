import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function currency(value: number, currencyCode = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizeCurrencyCode(currencyCode),
    currencyDisplay: "symbol",
    maximumFractionDigits: 2
  }).format(value);
}

export function percent(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  }).format(value);
}

export function monthLabel(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  if (!year || !monthIndex) return month;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric"
  }).format(new Date(year, monthIndex - 1, 1));
}

export function normalizeCurrencyCode(currencyCode?: string) {
  const value = (currencyCode || "USD").trim().toUpperCase();
  if (!value) return "USD";
  if (value === "N" || value === "NAIRA") return "NGN";
  if (value === "CAD$" || value === "C$") return "CAD";
  if (value === "US$") return "USD";
  return value.slice(0, 3);
}
