import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    page?: string;
    limit?: string;
    sort?: string;
    dir?: string;
    tl?: string;
    type?: string;
  }>;
}

/** Special orders share the Manual list. Detail bookmarks stay on `/orders/special/[id]`. */
export default async function SpecialOrdersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const next = new URLSearchParams();
  if (params.tab) next.set("tab", params.tab);
  if (params.page) next.set("page", params.page);
  if (params.limit) next.set("limit", params.limit);
  if (params.sort) next.set("sort", params.sort);
  if (params.dir) next.set("dir", params.dir);
  if (params.tl) next.set("tl", params.tl);
  next.set("type", "special");
  redirect(`/orders/manual?${next.toString()}`);
}
