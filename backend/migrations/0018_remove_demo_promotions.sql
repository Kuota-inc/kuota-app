-- Tres promociones de ejemplo (Comercios Gamarra, Red de Bodegas, Fabricantes Trujillanos) se sembraban también en
-- producción y se mostraban a usuarios reales como ofertas. Son inventadas: se retiran. Las promociones reales se
-- cargarán desde la administración cuando existan convenios.
DELETE FROM public.promotions WHERE id IN ('promo_01', 'promo_02', 'promo_03');
