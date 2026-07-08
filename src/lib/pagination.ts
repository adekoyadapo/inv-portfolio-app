export type SortDirection = "asc" | "desc";

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: currentPage,
    totalItems,
    totalPages,
    start
  };
}

export function sortByComparator<T>(items: T[], compare: (a: T, b: T) => number, direction: SortDirection) {
  const sorted = [...items].sort(compare);
  return direction === "desc" ? sorted.reverse() : sorted;
}
