-- Where an appointment came from: which user created it and how.
-- created_via: 'manual' (New button) | 'click' (slot click) | 'drag' (drag-select) | 'shared' (patient self-booked via turn picker)
ALTER TABLE appointments ADD COLUMN created_by TEXT;
ALTER TABLE appointments ADD COLUMN created_via TEXT NOT NULL DEFAULT 'manual';
