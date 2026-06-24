-- Link legacy drug_inventory rows to drug_stores using the location text field.
-- Run after 21_drug_stores_schema.sql.

UPDATE drug_inventory di
INNER JOIN drug_stores ds ON ds.storeName = di.location AND ds.isActive = 1
SET di.storeId = ds.storeId,
    di.branchId = COALESCE(di.branchId, ds.branchId)
WHERE di.storeId IS NULL
  AND di.location IS NOT NULL
  AND TRIM(di.location) <> '';

UPDATE drug_inventory di
INNER JOIN drug_stores ds ON ds.storeCode = di.location AND ds.isActive = 1
SET di.storeId = ds.storeId,
    di.branchId = COALESCE(di.branchId, ds.branchId)
WHERE di.storeId IS NULL
  AND di.location IS NOT NULL
  AND TRIM(di.location) <> '';
