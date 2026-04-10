-- Unique (vehicle_id, timestamp) for idempotent inserts from the tracking consumer.
-- Safe on DBs that already have duplicate pairs: delete extras first, then add constraint.

DELETE FROM vehicle_locations a
    USING vehicle_locations b
WHERE a.ctid < b.ctid
  AND a.vehicle_id = b.vehicle_id
  AND a.timestamp = b.timestamp;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
                 JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'vehicle_locations'
          AND c.conname = 'vehicle_locations_vehicle_id_timestamp_uq'
    ) THEN
        ALTER TABLE vehicle_locations
            ADD CONSTRAINT vehicle_locations_vehicle_id_timestamp_uq
                UNIQUE (vehicle_id, timestamp);
    END IF;
END $$;
