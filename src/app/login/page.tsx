import { redirect } from "next/navigation";

import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSession } from "@/lib/auth";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await getSession();
  const params = await searchParams;
  if (session) redirect(params.next || "/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Admin sign in</CardTitle>
          <CardDescription>Use the local admin credentials configured for this environment.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="flex flex-col gap-4">
            <input type="hidden" name="next" value={params.next || "/dashboard"} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" autoComplete="username" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            {params.error ? <p className="text-sm text-destructive">Invalid username or password.</p> : null}
            <Button type="submit">Sign in</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
