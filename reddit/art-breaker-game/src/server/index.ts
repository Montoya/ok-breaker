import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';

import { createServer, getServerPort } from '@devvit/web/server';
import { triggers } from './routes/triggers';
import { schedulerRoutes } from './routes/scheduler';
import { appRouter } from './trpc';
import { createContext } from './context';

const app = new Hono();

const api = new Hono();
api.use(
  '/trpc/*',
  trpcServer({
    endpoint: '/api/trpc',
    router: appRouter,
    createContext,
  })
);

const internal = new Hono();
internal.route('/triggers', triggers);
internal.route('/scheduler', schedulerRoutes);

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer: createServer,
  port: getServerPort(),
});
