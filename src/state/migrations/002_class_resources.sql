-- 002_class_resources.sql — Add class_resources_json to characters
-- Stores expendable resources as JSON: { "ki_points": { "current": 3, "max": 3, "restoresOn": "short" }, ... }
ALTER TABLE characters ADD COLUMN class_resources_json TEXT DEFAULT '{}';
