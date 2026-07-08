import type { Account, AccountSnapshot, DashboardData, DrilldownData, DrilldownScope, Institution, MonthlyRecord } from "@/lib/types";

export function buildDashboardData(
  institutions: Institution[],
  accounts: Account[],
  records: MonthlyRecord[]
): DashboardData {
  const institutionById = new Map(institutions.map((institution) => [institution.id, institution]));
  const latestByAccount = new Map<string, MonthlyRecord>();

  for (const record of records) {
    const existing = latestByAccount.get(record.accountId);
    if (!existing || record.month > existing.month) {
      latestByAccount.set(record.accountId, record);
    }
  }

  const accountSnapshots: AccountSnapshot[] = accounts.map((account) => ({
    account,
    institution: institutionById.get(account.institutionId) || {
      id: account.institutionId,
      name: "Unknown institution",
      createdAt: "",
      updatedAt: ""
    },
    latest: latestByAccount.get(account.id)
  }));

  const currentValue = accountSnapshots.reduce((sum, snapshot) => sum + (snapshot.latest?.currentValue || 0), 0);
  const invested = accountSnapshots.reduce((sum, snapshot) => sum + (snapshot.latest?.amountInvested || 0), 0);
  const gainLoss = currentValue - invested;
  const gainLossPercent = invested > 0 ? gainLoss / invested : 0;

  const latestMonth = records.reduce((latest, record) => (record.month > latest ? record.month : latest), "");
  const previousMonth = records
    .filter((record) => record.month < latestMonth)
    .reduce((latest, record) => (record.month > latest ? record.month : latest), "");
  const latestTotal = sumRecordsForMonth(records, latestMonth, "currentValue");
  const previousTotal = sumRecordsForMonth(records, previousMonth, "currentValue");

  const timeline = [...new Set(records.map((record) => record.month))]
    .sort()
    .map((month) => ({
      month,
      invested: sumRecordsForMonth(records, month, "amountInvested"),
      currentValue: sumRecordsForMonth(records, month, "currentValue")
    }));

  const institutionBreakdown = institutions
    .map((institution) => {
      const institutionSnapshots = accountSnapshots.filter((snapshot) => snapshot.account.institutionId === institution.id);
      return {
        id: institution.id,
        name: institution.name,
        currentValue: institutionSnapshots.reduce((sum, snapshot) => sum + (snapshot.latest?.currentValue || 0), 0),
        invested: institutionSnapshots.reduce((sum, snapshot) => sum + (snapshot.latest?.amountInvested || 0), 0)
      };
    })
    .filter((item) => item.currentValue > 0 || item.invested > 0);

  const typeBreakdown = [...new Set(accounts.map((account) => account.type))]
    .sort()
    .map((type) => {
      const typeSnapshots = accountSnapshots.filter((snapshot) => snapshot.account.type === type);
      return {
        type,
        currentValue: typeSnapshots.reduce((sum, snapshot) => sum + (snapshot.latest?.currentValue || 0), 0),
        invested: typeSnapshots.reduce((sum, snapshot) => sum + (snapshot.latest?.amountInvested || 0), 0)
      };
    })
    .filter((item) => item.currentValue > 0 || item.invested > 0);

  return {
    institutions,
    accounts,
    records,
    accountSnapshots,
    totals: {
      currentValue,
      invested,
      gainLoss,
      gainLossPercent,
      momDelta: latestTotal - previousTotal
    },
    timeline,
    institutionBreakdown,
    typeBreakdown
  };
}

export function buildDrilldownData(
  institutions: Institution[],
  accounts: Account[],
  records: MonthlyRecord[],
  scope: DrilldownScope,
  id: string
): DrilldownData | null {
  const institutionById = new Map(institutions.map((institution) => [institution.id, institution]));
  const selectedAccounts = accounts.filter((account) => {
    if (scope === "institution") return account.institutionId === id;
    if (scope === "type") return account.type === id;
    return account.id === id;
  });

  if (selectedAccounts.length === 0) return null;

  const selectedAccountIds = new Set(selectedAccounts.map((account) => account.id));
  const selectedInstitutionIds = new Set(selectedAccounts.map((account) => account.institutionId));
  const selectedRecords = records.filter((record) => selectedAccountIds.has(record.accountId));
  const selectedInstitutions = institutions.filter((institution) => selectedInstitutionIds.has(institution.id));
  const dashboard = buildDashboardData(selectedInstitutions, selectedAccounts, selectedRecords);

  const label = getDrilldownLabel(scope, id, selectedAccounts, institutionById);
  const subtitle =
    scope === "account"
      ? `${institutionById.get(selectedAccounts[0].institutionId)?.name || "Unknown institution"} / ${selectedAccounts[0].type}`
      : `${selectedAccounts.length} account${selectedAccounts.length === 1 ? "" : "s"}`;

  const momRows = dashboard.timeline.map((point, index) => {
    const previous = index > 0 ? dashboard.timeline[index - 1] : undefined;
    const momDelta = previous ? point.currentValue - previous.currentValue : 0;
    return {
      month: point.month,
      invested: point.invested,
      currentValue: point.currentValue,
      gainLoss: point.currentValue - point.invested,
      momDelta,
      momPercent: previous && previous.currentValue > 0 ? momDelta / previous.currentValue : 0
    };
  });

  const accountBreakdown = selectedAccounts
    .map((account) => {
      const latest = selectedRecords
        .filter((record) => record.accountId === account.id)
        .sort((left, right) => right.month.localeCompare(left.month))[0];
      const invested = latest?.amountInvested || 0;
      const currentValue = latest?.currentValue || 0;
      return {
        id: account.id,
        name: account.name,
        institutionName: institutionById.get(account.institutionId)?.name || "Unknown institution",
        type: account.type,
        currentValue,
        invested,
        gainLoss: currentValue - invested
      };
    })
    .sort((left, right) => right.currentValue - left.currentValue);

  return {
    ...dashboard,
    scope,
    id,
    label,
    subtitle,
    momRows,
    accountBreakdown
  };
}

function sumRecordsForMonth(records: MonthlyRecord[], month: string, key: "amountInvested" | "currentValue") {
  if (!month) return 0;
  return records.filter((record) => record.month === month).reduce((sum, record) => sum + record[key], 0);
}

function getDrilldownLabel(
  scope: DrilldownScope,
  id: string,
  selectedAccounts: Account[],
  institutionById: Map<string, Institution>
) {
  if (scope === "institution") {
    return institutionById.get(id)?.name || "Institution";
  }

  if (scope === "type") {
    return `${id} accounts`;
  }

  return selectedAccounts[0]?.name || "Account";
}
