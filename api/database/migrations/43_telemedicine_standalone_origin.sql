-- Keep originType ENUM aligned with all app features. Must include `queue` when DBs already have
-- queue-originated sessions (43_telemedicine_queue_origin.sql) or data imported from such DBs;
-- narrowing the ENUM causes "Data truncated for column 'originType'" on ALTER.

ALTER TABLE telemedicine_sessions
  MODIFY COLUMN originType ENUM('appointment', 'inpatient', 'standalone', 'queue') NOT NULL;
