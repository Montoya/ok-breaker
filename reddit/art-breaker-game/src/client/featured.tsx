import './index.css';
import { navigateTo } from '@devvit/web/client';
import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../server/trpc';
import { BoardCanvas } from './board-canvas';
import { BoardLoader, Brand } from './chrome';
import { trpc } from './trpc';
import { messageOf, redditUrl } from './utils';

type FeaturedPage = inferRouterOutputs<AppRouter>['featured']['page'];

export const FeaturedSplash = () => {
  const [data, setData] = useState<FeaturedPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadPage = useCallback(async (page: number) => {
    setLoading(true);
    setError('');
    try {
      setData(await trpc.featured.page.query({ page }));
    } catch (loadError) {
      setError(messageOf(loadError));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    void trpc.featured.page.query({ page: 0 })
      .then((page) => { if (active) setData(page); })
      .catch((loadError) => { if (active) setError(messageOf(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <main className="featured-shell">
      <header className="featured-header">
        <Brand />
        <p>Featured boards from our community</p>
      </header>
      <div className="featured-content">
        {loading ? (
          <div className="screen-loading board-loading" role="status" aria-live="polite">
            <BoardLoader label="Loading featured boards…" />
          </div>
        ) : error ? (
          <p className="featured-message" role="alert">{error}</p>
        ) : data?.boards.length ? (
          <div className="featured-board-grid">
            {data.boards.map((board) => (
              <button
                key={board.id}
                className="board-card"
                type="button"
                onClick={() => board.permalink && navigateTo(redditUrl(board.permalink))}
              >
                <div className="board-card-preview">
                  <BoardCanvas board={board} compact label={board.title} />
                </div>
                <strong>{board.title}</strong>
                <small>Created by u/{board.creatorUsername}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="featured-message">No featured boards available.</p>
        )}
      </div>
      <div className="pager featured-pager">
        <button
          type="button"
          disabled={loading || !data || data.page === 0}
          onClick={() => data && void loadPage(data.page - 1)}
        >
          ← PREV
        </button>
        <span>{data ? `${data.page + 1} / ${data.pages}` : '1 / 1'}</span>
        <button
          type="button"
          disabled={loading || !data || data.page + 1 >= data.pages}
          onClick={() => data && void loadPage(data.page + 1)}
        >
          NEXT →
        </button>
      </div>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode><FeaturedSplash /></StrictMode>
);
