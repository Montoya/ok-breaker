import './index.css';
import { requestExpandedMode } from '@devvit/web/client';
import {
  StrictMode,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from 'react';
import { createRoot } from 'react-dom/client';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../server/trpc';
import { trpc } from './trpc';
import { BoardCanvas } from './board-canvas';
import { ArcadeButton, BoardLoader, Header } from './chrome';
import { getDeviceId, messageOf } from './utils';
import { startRedditLogin } from './login';
import { cachePlayBoard } from './play-handoff';

type Bootstrap = inferRouterOutputs<AppRouter>['bootstrap'];

export const Preview = () => {
  const deviceId = useMemo(() => getDeviceId(), []);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(
    () => localStorage.getItem('art-breaker-sound') === 'off'
  );
  const [signInDialog, setSignInDialog] = useState(false);
  useEffect(() => {
    let active = true;
    void trpc.bootstrap
      .query({ deviceId })
      .then((bootstrap) => {
        if (active) setData(bootstrap);
      })
      .catch((loadError) => {
        if (active) setError(messageOf(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [deviceId]);
  const retry = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await trpc.bootstrap.query({ deviceId }));
    } catch (loadError) {
      setError(messageOf(loadError));
    } finally {
      setLoading(false);
    }
  };
  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('art-breaker-sound', next ? 'off' : 'on');
  };
  const open = (
    event: MouseEvent<HTMLButtonElement>,
    view: 'play' | 'create' | 'leaderboard'
  ) => {
    if (view === 'create' && !data?.user.authenticated) {
      setSignInDialog(true);
      return;
    }
    localStorage.setItem('art-breaker-intended-view', view);
    if (view !== 'create' && data?.postId)
      cachePlayBoard(data.board, data.postId);
    requestExpandedMode(event.nativeEvent, 'game');
  };
  const signIn = (event: MouseEvent<HTMLButtonElement>) => {
    setSignInDialog(false);
    startRedditLogin(event.nativeEvent);
  };
  return (
    <main className="preview-shell">
      <Header
        muted={muted}
        onSound={toggleSound}
        subtitle="Make art... and then break it!"
      />
      <article className="post-card">
        {data ? (
          <>
            <div className="art-frame">
              <BoardCanvas
                board={data.board}
                compact
                label={`Preview of ${data.board.title}`}
              />
            </div>
            <div className="post-copy">
              <div>
                <strong>{data.board.title}</strong>
                <small>By u/{data.board.creatorUsername}</small>
              </div>
              <div className="mini-stat">
                <button
                  className="mini-stat-link"
                  type="button"
                  aria-label="Open leaderboard"
                  onClick={(event) => open(event, 'leaderboard')}
                >
                  <small>BEST</small>
                </button>
                <strong>
                  {data.ranking.best?.score.toLocaleString('en-US') ?? '—'}
                </strong>
              </div>
            </div>
            <div className="button-row">
              <ArcadeButton
                tone="primary"
                onClick={(event) => open(event, 'play')}
              >
                PLAY
              </ArcadeButton>
              <ArcadeButton
                tone="blue"
                onClick={(event) => open(event, 'create')}
              >
                CREATE
              </ArcadeButton>
            </div>
          </>
        ) : (
          <>
            <div
              className="art-frame board-loading"
              role="status"
              aria-live="polite"
            >
              {loading ? (
                <BoardLoader />
              ) : (
                <>
                  <strong>Couldn't load this board.</strong>
                  <small>{error}</small>
                </>
              )}
            </div>
            <div className="post-copy loading-copy">
              <div>
                <strong>
                  {loading ? 'Loading artwork…' : 'Board unavailable'}
                </strong>
              </div>
            </div>
            <div className="button-row">
              {loading ? (
                <>
                  <ArcadeButton tone="primary" disabled>
                    PLAY
                  </ArcadeButton>
                  <ArcadeButton tone="blue" disabled>
                    CREATE
                  </ArcadeButton>
                </>
              ) : (
                <ArcadeButton tone="primary" onClick={() => void retry()}>
                  TRY AGAIN
                </ArcadeButton>
              )}
            </div>
          </>
        )}
      </article>
      {signInDialog && (
        <div className="modal-backdrop">
          <section
            className="sign-in-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-in-title"
          >
            <h2 id="sign-in-title">Sign in to create</h2>
            <p>Sign in to Reddit to make your own Art Breaker board.</p>
            <div className="button-row">
              <ArcadeButton onClick={() => setSignInDialog(false)}>
                CANCEL
              </ArcadeButton>
              <ArcadeButton tone="blue" onClick={signIn}>
                SIGN IN
              </ArcadeButton>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);
