-- Telemedicine facility attribution and accurate lifecycle timestamps.
-- Required for branch reporting and held-session duration metrics.

DROP PROCEDURE IF EXISTS add_tm_metrics_column;
DROP PROCEDURE IF EXISTS add_tm_metrics_index;

DELIMITER //

CREATE PROCEDURE add_tm_metrics_column(
  IN p_column_name VARCHAR(64),
  IN p_column_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'telemedicine_sessions'
      AND COLUMN_NAME = p_column_name
  ) THEN
    SET @ddl = CONCAT(
      'ALTER TABLE telemedicine_sessions ADD COLUMN ',
      p_column_name,
      ' ',
      p_column_definition
    );
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //

CREATE PROCEDURE add_tm_metrics_index(
  IN p_index_name VARCHAR(64),
  IN p_index_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'telemedicine_sessions'
      AND INDEX_NAME = p_index_name
  ) THEN
    SET @ddl = CONCAT(
      'ALTER TABLE telemedicine_sessions ADD INDEX ',
      p_index_name,
      ' ',
      p_index_definition
    );
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END //

DELIMITER ;

CALL add_tm_metrics_column('branchId', 'INT NULL AFTER queueEntryId');
CALL add_tm_metrics_column('startedAt', 'DATETIME NULL AFTER status');
CALL add_tm_metrics_column('endedAt', 'DATETIME NULL AFTER startedAt');

CALL add_tm_metrics_index('idx_tm_branch_started', '(branchId, startedAt)');
CALL add_tm_metrics_index('idx_tm_branch_status_created', '(branchId, status, createdAt)');
CALL add_tm_metrics_index('idx_tm_started_status', '(startedAt, status)');

-- Prefer the branch where care was delivered. Patient registration branch is
-- only a fallback for standalone and legacy sessions.
UPDATE telemedicine_sessions ts
LEFT JOIN queue_entries q ON ts.queueEntryId = q.queueId
LEFT JOIN appointments a ON ts.appointmentId = a.appointmentId
LEFT JOIN patients p ON ts.patientId = p.patientId
SET ts.branchId = COALESCE(q.branchId, a.branchId, p.registeredBranchId)
WHERE ts.branchId IS NULL;

-- Backfill lifecycle timestamps from immutable audit events.
UPDATE telemedicine_sessions ts
INNER JOIN (
  SELECT sessionId, MIN(eventAt) AS startedAt
  FROM telemedicine_session_audit
  WHERE eventType = 'teleconsult_started'
  GROUP BY sessionId
) started ON started.sessionId = ts.sessionId
SET ts.startedAt = COALESCE(ts.startedAt, started.startedAt)
WHERE ts.startedAt IS NULL;

UPDATE telemedicine_sessions ts
INNER JOIN (
  SELECT sessionId, MIN(eventAt) AS endedAt
  FROM telemedicine_session_audit
  WHERE eventType = 'call_ended'
  GROUP BY sessionId
) ended ON ended.sessionId = ts.sessionId
SET ts.endedAt = COALESCE(ts.endedAt, ended.endedAt)
WHERE ts.endedAt IS NULL;

-- Legacy ended rows may pre-date audit logging. Keep them visible in held
-- metrics using their last known timestamps.
UPDATE telemedicine_sessions
SET startedAt = COALESCE(startedAt, createdAt),
    endedAt = COALESCE(endedAt, updatedAt)
WHERE status = 'ended';

DROP PROCEDURE IF EXISTS add_tm_metrics_column;
DROP PROCEDURE IF EXISTS add_tm_metrics_index;
