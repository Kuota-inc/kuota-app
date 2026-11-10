import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { initDatabase } from './db/database.js';
import { publicRouter } from './routes/public.routes.js';
import { onboardingRouter } from './routes/onboarding.routes.js';
import { merchantRouter } from './routes/merchant.routes.js';
import { creditRouter } from './routes/credit.routes.js';
import { paymentLinkRouter } from './routes/paymentLink.routes.js';
import { providerRouter } from './routes/provider.routes.js';
import { authRouter, paymentSecurityRouter } from './routes/security.routes.js';
import { sandboxRouter, webhookRouter } from './routes/webhook.routes.js';
import { internalRouter } from './routes/internal.routes.js';
import { payPageRouter } from './routes/payPage.routes.js';
import { devRouter } from './routes/dev.routes.js';
import { legalRouter } from './routes/legal.routes.js';
import { config, isAllowedOrigin } from './security/config.js';
import { rateLimit } from './security/guards.js';

export async function createApp() {
  await initDatabase();
  const app = express();
  app.disable('x-powered-by');
  // Detrás de un proxy/API Gateway, confiar solo en el primer salto para req.ip.
  // En Railway siempre hay un proxy delante: sin esto todas las peticiones comparten la IP del proxy
  // (los límites por IP se agotan para todos los usuarios a la vez y la bitácora registra IPs falsas).
  if (process.env.KUOTA_TRUST_PROXY === '1' || (process.env.RAILWAY_ENVIRONMENT && process.env.KUOTA_TRUST_PROXY !== '0')) app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  app.use(
    cors({
      // Sin Origin (app nativa, servidor a servidor, webhooks): permitido; con Origin: lista explícita.
      origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)),
      exposedHeaders: ['Idempotent-Replayed', 'Retry-After']
    })
  );

  // Cuerpo crudo para verificar la firma de los webhooks; límite de tamaño.
  app.use(
    express.json({
      limit: '200kb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = Buffer.from(buf);
      }
    })
  );

  app.use('/api/v1', rateLimit({ name: 'api', windowMs: 60_000, max: 600 }));

  app.use('/api/v1', publicRouter);
  app.use('/api/v1/public', publicRouter);
  app.use('/api/v1/catalogs', publicRouter);
  app.use('/api/v1/legal', publicRouter);
  app.use('/api/v1/onboarding', onboardingRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/merchants/me/payments', paymentSecurityRouter);
  app.use('/api/v1/merchants/me', merchantRouter);
  app.use('/api/v1/credit', creditRouter);
  app.use('/api/v1/payment-links', paymentLinkRouter);
  app.use('/api/v1/webhooks', webhookRouter);
  app.use('/api/v1/sandbox', sandboxRouter);
  app.use('/api/v1/internal', internalRouter);
  app.use('/api/v1/providers', providerRouter);
  app.use('/api/v1/businesses', providerRouter);
  app.use('/api/v1/kyc', providerRouter);
  app.use('/api/v1', providerRouter);
  app.use('/api/v1/geo', providerRouter);

  if (!config.isProd) app.use('/api/v1/dev', devRouter);

  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', app: 'Kuota Backend API', version: '1.1.0', currency: 'PEN', sandbox: config.sandboxEnabled, fee_bps: config.feeBps, timestamp: new Date().toISOString() });
  });

  // Página de cobro para clientes (sin sesión, HTML)
  app.use('/pay', payPageRouter);
  // Privacidad, Términos y Libro de Reclamaciones (páginas públicas + POST /api/v1/complaints)
  app.use(legalRouter);

  // Manejador central de errores (formato PRD 00). En producción no se filtran detalles internos.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo no es un JSON válido.', fields: [] } });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'La solicitud es demasiado grande.', fields: [] } });
    }
    const status = Number.isInteger(err?.status) ? err.status : 500;
    console.error('[Error]', status, err?.code ?? '', err?.message ?? err);
    res.status(status).json({
      error: {
        code: err?.code || 'INTERNAL_SERVER_ERROR',
        message:
          status >= 500 && config.isProd
            ? 'Ha ocurrido un error inesperado en los servidores de Kuota.'
            : err?.message || 'Ha ocurrido un error inesperado en los servidores de Kuota.',
        fields: err?.fields || []
      }
    });
  });

  return app;
}
