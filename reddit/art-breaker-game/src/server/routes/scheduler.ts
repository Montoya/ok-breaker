import { Hono } from 'hono';
import { publishNextQueued } from '../core/publication';

export const schedulerRoutes = new Hono();

schedulerRoutes.post('/daily-publish', async (c) => {
  const result = await publishNextQueued();
  return c.json({ status: 'ok', ...result }, 200);
});
