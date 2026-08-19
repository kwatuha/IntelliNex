-- Ensure Telemedicine exists as a bookable department/service for appointments.
INSERT INTO departments (departmentName, description, location, isActive)
SELECT 'Telemedicine', 'Remote video consultations and teleconsult follow-ups', 'Virtual', 1
WHERE NOT EXISTS (
  SELECT 1 FROM departments
  WHERE LOWER(TRIM(departmentName)) = 'telemedicine'
);
