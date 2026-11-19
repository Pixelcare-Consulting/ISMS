import { pulloutAuditLabel } from "@/app/(app)/logistics/_components/pullout-tracker";
import { transferAuditLabel } from "@/app/(app)/logistics/_components/transfer-tracker";

// Approvals come from Team Leads, Supply Planning, admins, and (pull-outs) anyone holding the
// approve permission. The history row already names the actor, so the label names no role.
describe("logistics approval history labels", () => {
  it("does not credit transfer approvals to a role", () => {
    expect(transferAuditLabel("transfer.approved")).toBe("Approved");
  });

  it("does not credit pull-out approvals to a role", () => {
    expect(pulloutAuditLabel("pullout.approved")).toBe("Approved");
  });
});
