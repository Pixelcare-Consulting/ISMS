-- No-op: the truncated index name
-- "monthly_sir_requests_tenant_id_requested_by_id_branch_id_uses_f" is created
-- later by 20261015204500_monthly_sir_free_slot_policy with the final short name.
-- Renaming here fails on empty DBs (index does not exist yet).
SELECT 1;
