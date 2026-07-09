import { MasterDataHeader } from "@/app/(app)/settings/master-data/_components/master-data-header";

export default function MasterDataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <MasterDataHeader />
      {children}
    </div>
  );
}
