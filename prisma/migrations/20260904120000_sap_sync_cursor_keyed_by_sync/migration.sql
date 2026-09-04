-- Re-key sap_sync_cursors from the Service Layer entity name to the sync's own key.
--
-- The cursor used the entity name ("Warehouses", "Items", …) as its id, which worked only
-- because every sync happened to read a different entity. The warehouse-type syncs break
-- that: `warehouse`, `branch-from-warehouse` and `service-center` all read `Warehouses`,
-- and sharing one cursor would have each advance past the others' rows — silently
-- dropping them.
--
-- Renaming rather than dropping keeps every sync's place: without this, the next run of
-- each finds no cursor, starts a fresh pass, and re-walks the entity from the beginning
-- (several minutes and millions of rows for serial numbers).
--
-- Written to be safe to re-run: each rename is skipped if the old row is gone or a row
-- already sits under the new key.
DO $$
DECLARE
  mapping CONSTANT text[][] := ARRAY[
    ['Branches',            'branch'],
    ['Warehouses',          'warehouse'],
    ['BusinessPartners',    'dealer'],
    ['Items',               'product-model'],
    ['SerialNumberDetails', 'serial-number']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(mapping, 1) LOOP
    UPDATE sap_sync_cursors AS c
       SET entity = mapping[i][2]
     WHERE c.entity = mapping[i][1]
       AND NOT EXISTS (
         SELECT 1
           FROM sap_sync_cursors AS existing
          WHERE existing.tenant_id = c.tenant_id
            AND existing.entity = mapping[i][2]
       );
  END LOOP;
END $$;
