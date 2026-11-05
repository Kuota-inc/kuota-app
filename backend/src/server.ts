import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initDatabase } from './db/database.js';
import { publicRouter } from './routes/public.routes.js';
import { onboardingRouter } from './routes/onboarding.routes.js';
import { merchantRouter } from './routes/merchant.routes.js';
import { creditRouter } from './routes/credit.routes.js';
import { paymentLinkRouter } from './routes/paymentLink.routes.js';
import { providerRouter } from './routes/provider.routes.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Initialize Database & Seed
initDatabase();

// Mount Routers (Base /api/v1)
app.use('/api/v1', publicRouter);
app.use('/api/v1/public', publicRouter);
app.use('/api/v1/catalogs', publicRouter);
app.use('/api/v1/legal', publicRouter);
app.use('/api/v1/onboarding', onboardingRouter);
app.use('/api/v1/merchants/me', merchantRouter);
app.use('/api/v1/credit', creditRouter);
app.use('/api/v1/payment-links', paymentLinkRouter);
app.use('/api/v1/providers', providerRouter);
app.use('/api/v1/businesses', providerRouter);
app.use('/api/v1/kyc', providerRouter);
app.use('/api/v1', providerRouter);
app.use('/api/v1/geo', providerRouter);

// Health check
app.get('/api/v1/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    app: 'Kuota Backend API',
    version: '1.0.0',
    currency: 'PEN',
    timestamp: new Date().toISOString()
  });
});

// Centralized Error Handler (PRD 00 Spanish format)
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Error]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Ha ocurrido un error inesperado en los servidores de Kuota.',
      fields: err.fields || []
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Kuota Backend API running on http://localhost:${PORT}/api/v1`);
});
