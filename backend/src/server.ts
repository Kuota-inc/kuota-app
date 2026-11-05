import 'dotenv/config';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT) || 3001;

(await createApp()).listen(PORT, () => {
  console.log(`🚀 Kuota Backend API running on http://localhost:${PORT}/api/v1`);
});
