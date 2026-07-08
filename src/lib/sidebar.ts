import "server-only";

import { cookies } from "next/headers";

export const sidebarCookieName = "investment_admin_sidebar";

export async function getInitialSidebarCollapsed() {
  const cookieStore = await cookies();
  return cookieStore.get(sidebarCookieName)?.value === "collapsed";
}
