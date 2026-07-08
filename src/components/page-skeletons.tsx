import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="overflow-hidden">
            <CardContent className="flex min-h-40 flex-col justify-between p-5">
              <Skeleton className="size-11 rounded-full" />
              <div className="flex flex-col gap-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SkeletonCard className="h-96" />
        <SkeletonCard className="h-96" />
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-72" />
      </section>
    </div>
  );
}

export function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <section className="grid gap-4 xl:grid-cols-2">
        <SkeletonCard className="h-56" />
        <SkeletonCard className="h-56" />
      </section>
      <section className="grid gap-4 xl:grid-cols-3">
        <SkeletonCard className="h-80" />
        <SkeletonCard className="h-80" />
        <SkeletonCard className="h-80" />
      </section>
      <SkeletonCard className="h-96" />
    </div>
  );
}

export function AiImportSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SkeletonCard className="h-[32rem]" />
      <SkeletonCard className="h-[32rem]" />
    </div>
  );
}

function SkeletonCard({ className }: { className: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </CardHeader>
      <CardContent>
        <Skeleton className={className} />
      </CardContent>
    </Card>
  );
}
