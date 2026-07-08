import { buildDashboardData } from "@/lib/dashboard";
import type { Account, Institution, MonthlyRecord } from "@/lib/types";

const demoInstitutions: Institution[] = [
  { id: "demo-wealthsimple", name: "Wealthsimple", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
  { id: "demo-cibc", name: "CIBC", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
  { id: "demo-questrade", name: "Questrade", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
  { id: "demo-rbc", name: "RBC Direct Investing", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" }
];

const demoAccounts: Account[] = [
  account("demo-ws-tfsa", "demo-wealthsimple", "Growth TFSA", "TFSA"),
  account("demo-ws-rrsp", "demo-wealthsimple", "Retirement RRSP", "RRSP"),
  account("demo-cibc-resp", "demo-cibc", "Family RESP", "RESP"),
  account("demo-cibc-cash", "demo-cibc", "Emergency Cash", "Cash"),
  account("demo-qt-index", "demo-questrade", "Index ETF", "Index"),
  account("demo-qt-stock", "demo-questrade", "Stock Picks", "Stock"),
  account("demo-rbc-rrsp", "demo-rbc", "Dividend RRSP", "RRSP"),
  account("demo-rbc-tfsa", "demo-rbc", "Balanced TFSA", "TFSA")
];

const months = [
  "2025-08",
  "2025-09",
  "2025-10",
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07"
];

const accountProfiles = {
  "demo-ws-tfsa": { invested: 18400, monthly: 650, value: 19750, drift: 430 },
  "demo-ws-rrsp": { invested: 40200, monthly: 900, value: 42750, drift: 620 },
  "demo-cibc-resp": { invested: 21500, monthly: 500, value: 22900, drift: 310 },
  "demo-cibc-cash": { invested: 12000, monthly: 150, value: 12250, drift: 70 },
  "demo-qt-index": { invested: 56300, monthly: 1100, value: 61200, drift: 820 },
  "demo-qt-stock": { invested: 29200, monthly: 450, value: 31500, drift: 760 },
  "demo-rbc-rrsp": { invested: 48750, monthly: 850, value: 51100, drift: 510 },
  "demo-rbc-tfsa": { invested: 26600, monthly: 550, value: 28350, drift: 390 }
} satisfies Record<string, { invested: number; monthly: number; value: number; drift: number }>;

export function getDemoDashboardData() {
  return buildDashboardData(demoInstitutions, demoAccounts, demoRecords());
}

export function getDemoCollections() {
  return {
    institutions: demoInstitutions,
    accounts: demoAccounts,
    records: demoRecords()
  };
}

function account(id: string, institutionId: string, name: string, type: string): Account {
  return {
    id,
    institutionId,
    name,
    type,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z"
  };
}

function demoRecords(): MonthlyRecord[] {
  return demoAccounts.flatMap((demoAccount) => {
    const profile = accountProfiles[demoAccount.id as keyof typeof accountProfiles];
    return months.map((month, index) => {
      const cycle = Math.sin(index * 0.9 + demoAccount.id.length) * profile.drift;
      const amountInvested = profile.invested + profile.monthly * index;
      const currentValue = Math.max(0, profile.value + profile.monthly * index + cycle + index * profile.drift * 0.16);

      return {
        id: `${demoAccount.id}:${month}`,
        institutionId: demoAccount.institutionId,
        accountId: demoAccount.id,
        month,
        amountInvested: Math.round(amountInvested),
        currentValue: Math.round(currentValue),
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z"
      };
    });
  });
}
