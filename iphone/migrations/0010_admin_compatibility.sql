-- Additive compatibility for the published administration interface.
ALTER TABLE admin_config ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE editorial_playlists ADD COLUMN slug TEXT NOT NULL DEFAULT '';
ALTER TABLE editorial_playlists ADD COLUMN cover_url TEXT NOT NULL DEFAULT '';
ALTER TABLE editorial_playlists ADD COLUMN badge TEXT NOT NULL DEFAULT 'Редакция';
ALTER TABLE editorial_playlists ADD COLUMN is_published INTEGER NOT NULL DEFAULT 1;
ALTER TABLE editorial_playlists ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE editorial_playlists ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE editorial_playlists SET slug=id,cover_url=cover,is_published=is_active,sort_order=order_index,updated_at=created_at;
ALTER TABLE promo_banners ADD COLUMN cover_url TEXT NOT NULL DEFAULT '';
ALTER TABLE promo_banners ADD COLUMN target_url TEXT NOT NULL DEFAULT '';
ALTER TABLE promo_banners ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
UPDATE promo_banners SET target_url=link,updated_at=created_at;
ALTER TABLE broadcast_messages ADD COLUMN level TEXT NOT NULL DEFAULT 'info';
ALTER TABLE broadcast_messages ADD COLUMN action_label TEXT NOT NULL DEFAULT '';
ALTER TABLE broadcast_messages ADD COLUMN action_url TEXT NOT NULL DEFAULT '';
