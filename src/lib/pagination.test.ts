import { describe, expect, it } from "vitest";

import { paginate, sortByComparator } from "@/lib/pagination";

describe("paginate", () => {
  it("slices items for the requested page and reports totals", () => {
    const items = Array.from({ length: 25 }, (_, index) => index + 1);

    const result = paginate(items, 2, 10);

    expect(result.items).toEqual(Array.from({ length: 10 }, (_, index) => index + 11));
    expect(result.page).toBe(2);
    expect(result.totalItems).toBe(25);
    expect(result.totalPages).toBe(3);
    expect(result.start).toBe(10);
  });

  it("clamps an out-of-range page down to the last page", () => {
    const items = Array.from({ length: 5 }, (_, index) => index + 1);

    const result = paginate(items, 99, 10);

    expect(result.page).toBe(1);
    expect(result.items).toEqual(items);
  });

  it("clamps a page below 1 up to page 1", () => {
    const items = [1, 2, 3];

    const result = paginate(items, 0, 10);

    expect(result.page).toBe(1);
  });

  it("handles an empty list without dividing by zero", () => {
    const result = paginate([], 1, 10);

    expect(result.items).toEqual([]);
    expect(result.totalItems).toBe(0);
    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
  });

  it("reflects page-size changes in the slice", () => {
    const items = Array.from({ length: 12 }, (_, index) => index + 1);

    const result = paginate(items, 1, 25);

    expect(result.items).toEqual(items);
    expect(result.totalPages).toBe(1);
  });
});

describe("sortByComparator", () => {
  const numericCompare = (a: number, b: number) => a - b;

  it("sorts ascending", () => {
    const result = sortByComparator([3, 1, 2], numericCompare, "asc");

    expect(result).toEqual([1, 2, 3]);
  });

  it("sorts descending", () => {
    const result = sortByComparator([3, 1, 2], numericCompare, "desc");

    expect(result).toEqual([3, 2, 1]);
  });

  it("does not mutate the input array", () => {
    const input = [3, 1, 2];

    sortByComparator(input, numericCompare, "asc");

    expect(input).toEqual([3, 1, 2]);
  });
});
