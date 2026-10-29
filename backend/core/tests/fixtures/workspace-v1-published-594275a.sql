PRAGMA foreign_keys=OFF;
PRAGMA user_version=1;
BEGIN TRANSACTION;
CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY,
    action TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    created_at TEXT NOT NULL
);
INSERT INTO "audit_events" VALUES(1,'settings','settings','2026-10-28T23:45:35.488773276+00:00');
INSERT INTO "audit_events" VALUES(2,'save_lot','6bc31244-516a-4ef6-985a-2e8c9ac45dd2','2026-10-28T23:45:35.494351686+00:00');
INSERT INTO "audit_events" VALUES(3,'save_lot','ff43a398-2344-45f0-9d2e-803851129845','2026-10-28T23:45:35.501234404+00:00');
INSERT INTO "audit_events" VALUES(4,'save_lot','60f4c547-11c9-4a27-a689-68f35fc368bb','2026-10-28T23:45:35.510602300+00:00');
INSERT INTO "audit_events" VALUES(5,'watch','60f4c547-11c9-4a27-a689-68f35fc368bb','2026-10-28T23:45:35.529269503+00:00');
INSERT INTO "audit_events" VALUES(6,'purchase','cd99f3d7-9cf3-4e36-acfc-58e9296bac0e','2026-10-28T23:45:35.538748280+00:00');
INSERT INTO "audit_events" VALUES(7,'purchase','245c7e43-4298-4e2c-891c-732aa08052ce','2026-10-28T23:45:35.550231560+00:00');
INSERT INTO "audit_events" VALUES(8,'sell','245c7e43-4298-4e2c-891c-732aa08052ce','2026-10-28T23:45:35.562088994+00:00');
CREATE TABLE inventory (
    id TEXT PRIMARY KEY,
    lot_id TEXT NOT NULL UNIQUE REFERENCES lots(id),
    title TEXT NOT NULL,
    acquisition_cents INTEGER NOT NULL CHECK (acquisition_cents >= 0),
    purchased_at TEXT NOT NULL,
    sale_net_cents INTEGER,
    sold_at TEXT,
    CHECK ((sale_net_cents IS NULL) = (sold_at IS NULL))
);
INSERT INTO "inventory" VALUES('cd99f3d7-9cf3-4e36-acfc-58e9296bac0e','6bc31244-516a-4ef6-985a-2e8c9ac45dd2','Held legacy fixture',5000,'2026-10-28T23:45:35.538748280+00:00',NULL,NULL);
INSERT INTO "inventory" VALUES('245c7e43-4298-4e2c-891c-732aa08052ce','ff43a398-2344-45f0-9d2e-803851129845','Sold legacy loss fixture',10000,'2026-10-28T23:45:35.550231560+00:00',-1000,'2026-10-28T23:45:35.562088994+00:00');
CREATE TABLE lots (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    watched INTEGER NOT NULL DEFAULT 0 CHECK (watched IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
INSERT INTO "lots" VALUES('6bc31244-516a-4ef6-985a-2e8c9ac45dd2','{"id":"6bc31244-516a-4ef6-985a-2e8c9ac45dd2","title":"Held legacy fixture","url":"https://example.com/compatibility-lot","source":"Community auction 🦆","category":"Tools","location":"Synthetic area","endsAt":"2030-01-01T00:00:00Z","condition":"Untested","notes":"Original café inspection\nPickup not yet verified.","bidCents":1000,"estimateCents":25000,"costs":{"premiumBps":1300,"taxBps":900,"paymentBps":0,"inboundCents":0,"travelCents":500,"prepCents":1000,"sellingFeeBps":1200,"reserveBps":500,"outboundCents":1000,"fixedSellingCents":50},"comparables":[{"title":"Included sale","url":"https://example.com/compatibility-evidence","soldOn":"2024-01-01","priceCents":30000,"shippingCents":1000,"condition":"Tested working","sold":true,"included":true},{"title":"Excluded sale","url":"https://example.com/compatibility-evidence","soldOn":"2024-01-01","priceCents":90000,"shippingCents":1000,"condition":"Tested working","sold":true,"included":false},{"title":"Asking context","url":"https://example.com/compatibility-evidence","soldOn":"2024-01-01","priceCents":100000,"shippingCents":1000,"condition":"Tested working","sold":false,"included":true}]}',0,'2026-10-28T23:45:35.494351686+00:00','2026-10-28T23:45:35.494351686+00:00');
INSERT INTO "lots" VALUES('ff43a398-2344-45f0-9d2e-803851129845','{"id":"ff43a398-2344-45f0-9d2e-803851129845","title":"Sold legacy loss fixture","url":"https://example.com/compatibility-lot","source":"Community auction 🦆","category":"Tools","location":"Synthetic area","endsAt":"2030-01-01T00:00:00Z","condition":"Untested","notes":"Original café inspection\nPickup not yet verified.","bidCents":1000,"estimateCents":25000,"costs":{"premiumBps":1300,"taxBps":900,"paymentBps":0,"inboundCents":0,"travelCents":500,"prepCents":1000,"sellingFeeBps":1200,"reserveBps":500,"outboundCents":1000,"fixedSellingCents":50},"comparables":[{"title":"Included sale","url":"https://example.com/compatibility-evidence","soldOn":"2024-01-01","priceCents":30000,"shippingCents":1000,"condition":"Tested working","sold":true,"included":true},{"title":"Excluded sale","url":"https://example.com/compatibility-evidence","soldOn":"2024-01-01","priceCents":90000,"shippingCents":1000,"condition":"Tested working","sold":true,"included":false},{"title":"Asking context","url":"https://example.com/compatibility-evidence","soldOn":"2024-01-01","priceCents":100000,"shippingCents":1000,"condition":"Tested working","sold":false,"included":true}]}',0,'2026-10-28T23:45:35.501234404+00:00','2026-10-28T23:45:35.501234404+00:00');
INSERT INTO "lots" VALUES('60f4c547-11c9-4a27-a689-68f35fc368bb','{"id":"60f4c547-11c9-4a27-a689-68f35fc368bb","title":"Watched legacy fixture","url":"https://example.com/compatibility-lot","source":"Community auction 🦆","category":"Tools","location":"Synthetic area","endsAt":"2030-01-01T00:00:00Z","condition":"Untested","notes":"Original café inspection\nPickup not yet verified.","bidCents":1000,"estimateCents":25000,"costs":{"premiumBps":1300,"taxBps":900,"paymentBps":0,"inboundCents":0,"travelCents":500,"prepCents":1000,"sellingFeeBps":1200,"reserveBps":500,"outboundCents":1000,"fixedSellingCents":50},"comparables":[{"title":"Included sale","url":"https://example.com/compatibility-evidence","soldOn":"2024-01-01","priceCents":30000,"shippingCents":1000,"condition":"Tested working","sold":true,"included":true},{"title":"Excluded sale","url":"https://example.com/compatibility-evidence","soldOn":"2024-01-01","priceCents":90000,"shippingCents":1000,"condition":"Tested working","sold":true,"included":false},{"title":"Asking context","url":"https://example.com/compatibility-evidence","soldOn":"2024-01-01","priceCents":100000,"shippingCents":1000,"condition":"Tested working","sold":false,"included":true}]}',1,'2026-10-28T23:45:35.510602300+00:00','2026-10-28T23:45:35.510602300+00:00');
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL);
INSERT INTO "settings" VALUES(1,'{"capitalCents":200000,"lotCapCents":35000,"minProfitCents":6500,"minRoiBps":4500}');
CREATE INDEX lots_watched ON lots(watched);
COMMIT;
PRAGMA foreign_keys=ON;
