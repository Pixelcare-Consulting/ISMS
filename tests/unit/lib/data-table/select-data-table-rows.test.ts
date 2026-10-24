import { selectDataTableRows } from "@/lib/data-table/select-data-table-rows";

describe("selectDataTableRows", () => {
  const page = [
    { id: "b", name: "Second" },
    { id: "a", name: "First" },
    { id: "c", name: "Third" },
  ];
  const resorted = [page[1], page[0], page[2]];
  const sliced = [page[0]];

  it("returns the given page unchanged when sorting and pagination are manual", () => {
    const rows = selectDataTableRows({
      data: page,
      clientSorted: resorted,
      clientPage: sliced,
      manualSorting: true,
      manualPagination: true,
      sortingEnabled: true,
      paginationEnabled: true,
    });

    expect(rows).toBe(page);
    expect(rows.map((row) => row.id)).toEqual(["b", "a", "c"]);
  });

  it("uses the client-sorted list only when sorting is not manual", () => {
    const rows = selectDataTableRows({
      data: page,
      clientSorted: resorted,
      clientPage: sliced,
      manualSorting: false,
      manualPagination: true,
      sortingEnabled: true,
      paginationEnabled: true,
    });

    expect(rows).toBe(resorted);
  });

  it("uses the client page slice only when pagination is not manual", () => {
    const rows = selectDataTableRows({
      data: page,
      clientSorted: resorted,
      clientPage: sliced,
      manualSorting: true,
      manualPagination: false,
      sortingEnabled: true,
      paginationEnabled: true,
    });

    expect(rows).toBe(sliced);
  });

  it("leaves the caller array alone when sorting and pagination are off", () => {
    const rows = selectDataTableRows({
      data: page,
      clientSorted: resorted,
      clientPage: sliced,
      manualSorting: true,
      manualPagination: true,
      sortingEnabled: false,
      paginationEnabled: false,
    });

    expect(rows).toBe(page);
  });
});
