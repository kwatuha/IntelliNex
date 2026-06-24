-- Extend expiry dates for expired drug_inventory batches (test data cleanup).
-- Adds 16 months to each expired batch expiryDate.
-- Safe to re-run: only rows with expiryDate < CURDATE() are updated.

-- Preview (optional — comment out UPDATE block and run SELECT only first):
-- SELECT drugInventoryId, batchNumber, medicationId, quantity, status, expiryDate AS old_expiry,
--        DATE_ADD(expiryDate, INTERVAL 16 MONTH) AS new_expiry
-- FROM drug_inventory
-- WHERE expiryDate IS NOT NULL
--   AND expiryDate < CURDATE()
--   AND COALESCE(quantity, 0) > 0
--   AND COALESCE(status, 'active') = 'active'
-- ORDER BY expiryDate;

UPDATE drug_inventory
SET expiryDate = DATE_ADD(expiryDate, INTERVAL 16 MONTH),
    updatedAt = NOW()
WHERE expiryDate IS NOT NULL
  AND expiryDate < CURDATE()
  AND COALESCE(quantity, 0) > 0
  AND COALESCE(status, 'active') = 'active';
