import { describe, expect, it } from "vitest";

import { buildDashboardData } from "@/lib/dashboard";
import type { Account, Institution, MonthlyRecord } from "@/lib/types";

const institutions: Institution[] = [
  { id: "i1", name: "Wealthsimple", createdAt: "", updatedAt: "" },
  { id: "i2", name: "CIBC", createdAt: "", updatedAt: "" }
];

const accounts: Account[] = [
  { id: "a1", institutionId: "i1", name: "TFSA", type: "TFSA", createdAt: "", updatedAt: "" },
  { id: "a2", institutionId: "i2", name: "RRSP", type: "RRSP", createdAt: "", updatedAt: "" }
];

const records: MonthlyRecord[] = [
  {
    id: "a1:2026-05",
    institutionId: "i1",
    accountId: "a1",
    month: "2026-05",
    amountInvested: 1000,
    currentValue: 1100,
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "a1:2026-06",
    institutionId: "i1",
    accountId: "a1",
    month: "2026-06",
    amountInvested: 1200,
    currentValue: 1500,
    createdAt: "",
    updatedAt: ""
  },
  {
    id: "a2:2026-06",
    institutionId: "i2",
    accountId: "a2",
    month: "2026-06",
    amountInvested: 2000,
    currentValue: 1900,
    createdAt: "",
    updatedAt: ""
  }
];

describe("buildDashboardData", () => {
  it("calculates totals from each account's latest monthly record", () => {
    const data = buildDashboardData(institutions, accounts, records);

    expect(data.totals.invested).toBe(3200);
    expect(data.totals.currentValue).toBe(3400);
    expect(data.totals.gainLoss).toBe(200);
    expect(data.totals.gainLossPercent).toBeCloseTo(0.0625);
  });

  it("builds month-over-month delta from portfolio month totals", () => {
    const data = buildDashboardData(institutions, accounts, records);

    expect(data.totals.momDelta).toBe(2300);
  });

  it("groups latest values by institution", () => {
    const data = buildDashboardData(institutions, accounts, records);

    expect(data.institutionBreakdown).toEqual([
      { id: "i1", name: "Wealthsimple", invested: 1200, currentValue: 1500 },
      { id: "i2", name: "CIBC", invested: 2000, currentValue: 1900 }
    ]);
  });
});
