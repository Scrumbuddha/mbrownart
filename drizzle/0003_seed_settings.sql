-- The app reads and updates settings row id = 1 but never inserts it; seed it with the column defaults.
INSERT INTO "settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
