import { Router } from 'express';
import { db } from '../db/database.js';

export const publicRouter = Router();

publicRouter.get('/stats', (req, res) => {
  res.json({
    active_businesses: 18500,
    verified_providers: 2400,
    average_approval_minutes: 5,
    timestamp: new Date().toISOString()
  });
});

publicRouter.get('/legal/documents', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  res.json({
    terms: {
      version: '2026.1',
      title: 'Términos y Condiciones del Servicio Kuota Perú',
      url: `${origin}/legal/terminos`,
      published_at: '2026-01-01T00:00:00Z'
    },
    privacy: {
      version: '2026.1',
      title: 'Política de Privacidad y Tratamiento de Datos Personales (Ley 29733)',
      url: `${origin}/legal/privacidad`,
      published_at: '2026-01-01T00:00:00Z'
    }
  });
});

publicRouter.get(['/catalogs/business-categories', '/business-categories'], (req, res) => {
  res.json([
    { code: 'FASHION', label: 'Ropa y Moda', icon: 'apparel', description: 'Prendas de vestir, telas y confecciones' },
    { code: 'FOOD', label: 'Comida / Bodega', icon: 'storefront', description: 'Abarrotes, alimentos y restaurantes' },
    { code: 'BEAUTY', label: 'Belleza y Cuidado', icon: 'spa', description: 'Cosméticos, peluquería y cuidado personal' },
    { code: 'CRAFTS', label: 'Artesanías y Regalos', icon: 'palette', description: 'Artesanías, regalos y papelería' },
    { code: 'FOOTWEAR', label: 'Calzado', icon: 'roller_skating', description: 'Zapatos, zapatillas y marroquinería' },
    { code: 'OTHER', label: 'Otros productos', icon: 'category', description: 'Venta de diversos artículos y servicios' }
  ]);
});

publicRouter.get(['/catalogs/seniority-ranges', '/seniority-ranges'], (req, res) => {
  res.json([
    { code: 'STARTING', label: '0–6 meses', subtitle: 'Emprendimiento en fase inicial' },
    { code: 'GROWING', label: '6–12 meses', subtitle: 'Negocio con tracción y clientela fija' },
    { code: 'CONSOLIDATED', label: 'Más de 1 año', subtitle: 'Accede a cuotas extendidas sin comisiones iniciales' }
  ]);
});

publicRouter.get(['/catalogs/provider-categories', '/provider-categories'], (req, res) => {
  res.json([
    { code: 'TEXTILES', label: 'Textiles y Confecciones', subtitle: 'Telas, avíos, hilos y prendas mayoristas' },
    { code: 'FOOTWEAR', label: 'Calzado e Insumos', subtitle: 'Cueros, suelas y calzado terminado' },
    { code: 'FOOD_WHOLESALE', label: 'Alimentos al por mayor', subtitle: 'Abarrotes, granos, sacos y bebidas' },
    { code: 'HARDWARE', label: 'Ferretería y Herramientas', subtitle: 'Materiales, pinturas y equipos' },
    { code: 'TECH_PARTS', label: 'Tecnología / Repuestos', subtitle: 'Componentes, accesorios y electrónica' },
    { code: 'OTHER', label: 'Otro rubro', subtitle: 'Otros insumos y productos industriales' }
  ]);
});

publicRouter.get(['/catalogs/provider-seniority-ranges', '/provider-seniority-ranges'], (req, res) => {
  res.json([
    { code: 'LT_6M', label: 'Menos de 6 meses', subtitle: 'Lanzamiento y primeras ventas mayoristas' },
    { code: '6M_1Y', label: '6 meses a 1 año', subtitle: 'Tracción comercial temprana' },
    { code: '1Y_3Y', label: '1 a 3 años', subtitle: 'Operación consolidada con cartera fija' },
    { code: 'GT_3Y', label: 'Más de 3 años', subtitle: 'Madurez, alto volumen y padrón SUNAT continuo' }
  ]);
});
