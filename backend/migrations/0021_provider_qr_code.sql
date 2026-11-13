-- Código QR estático por proveedor. Se genera en el registro y se muestra como imagen.
ALTER TABLE provider_profiles ADD COLUMN qr_code TEXT UNIQUE;
