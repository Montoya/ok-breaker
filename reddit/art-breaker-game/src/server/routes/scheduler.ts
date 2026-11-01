import { Hono } from 'hono';
import { publishNextQueued } from '../core/publication';
import { publishWeeklyFeatured } from '../core/featured';

export const schedulerRoutes = new Hono();

schedulerRoutes.post('/daily-publish', async (c) => {
  const result = await publishNextQueued();
  return c.json({ status: 'ok', ...result }, 200);
});

schedulerRoutes.post('/weekly-featured', async (c) => {
  const result = await publishWeeklyFeatured();
  return c.json({ status: 'ok', ...result }, 200);
});
