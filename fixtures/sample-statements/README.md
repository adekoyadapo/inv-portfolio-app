# Sample statements

These files are **fabricated** test fixtures (fake names, account numbers, and
figures) used to exercise Smart Import's spreadsheet parser against a few
common export shapes. None of them contain real account data.

- `balance-snapshot-sample.csv` — a plain balance-snapshot export (one row per
  account per month, with an explicit invested/current-value pair).
- `transaction-activity-sample.csv` — a transaction-history export using
  different column names than the built-in aliases' primary examples
  (`Ticker`/`Shares`/`Transaction Type` instead of `symbol`/`quantity`/`action`),
  with no balance column, to test the trade-ledger gain/loss estimate.
- `transaction-with-balance-sample.csv` — a transaction-history export that
  also includes a running/ending balance column, to test the balance-column
  path.

See `src/lib/ai-import.test.ts` for the tests that run these through the
parser.
