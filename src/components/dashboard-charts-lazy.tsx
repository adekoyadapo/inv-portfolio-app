"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

function ChartSkeleton({ className }: { className: string }) {
  return <Skeleton className={className} />;
}

export const PortfolioTimelineChart = dynamic(() => import("./dashboard-charts").then((mod) => mod.PortfolioTimelineChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-72 w-full sm:h-80" />
});

export const InstitutionBreakdownChart = dynamic(() => import("./dashboard-charts").then((mod) => mod.InstitutionBreakdownChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-72 w-full sm:h-80" />
});

export const AllocationDonutChart = dynamic(() => import("./dashboard-charts").then((mod) => mod.AllocationDonutChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-72 w-full" />
});

export const MomDeltaBarChart = dynamic(() => import("./dashboard-charts").then((mod) => mod.MomDeltaBarChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-72 w-full" />
});

export const AccountValueBarChart = dynamic(() => import("./dashboard-charts").then((mod) => mod.AccountValueBarChart), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-72 w-full" />
});

export const MetricSparkline = dynamic(() => import("./dashboard-charts").then((mod) => mod.MetricSparkline), {
  ssr: false,
  loading: () => <ChartSkeleton className="h-12 w-28" />
});
