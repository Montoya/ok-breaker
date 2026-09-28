import './index.css';
import { context, navigateTo, showShareSheet } from '@devvit/web/client';
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../server/trpc';
import {
  CLEAR_SCORE_MULTIPLIER,
  accuracyFor,
  formatAccuracyPercent,
  formatAutomaticScoreComment,
  formatTime,
  type Board,
} from '../shared/game';
import { trpc } from './trpc';
import { ArtBreakerEngine, type GameHud, type RunResult } from './game-engine';
import { ArcadeButton, BoardLoader, Header } from './chrome';
import { Editor } from './editor';
import { BoardCanvas } from './board-canvas';
import { cn, getDeviceId, messageOf, redditUrl } from './utils';
import { startRedditLogin } from './login';
import { readCachedPlayBoard } from './play-handoff';
import { QueryCache } from './query-cache';

type Ranking = inferRouterOutputs<AppRouter>['bootstrap']['ranking'];
type Session = inferRouterOutputs<AppRouter>['session']['summary'];
type EditorSession = inferRouterOutputs<AppRouter>['session']['editor'];
type Discovery = inferRouterOutputs<AppRouter>['boards']['discover'];
type View =
  | 'play'
  | 'preview-play'
  | 'score-loading'
  | 'create'
  | 'result-sign-in'
  | 'result-join'
  | 'result-comment'
  | 'result-share'
  | 'leaderboard'
  | 'results'
  | 'more';
type Completed = RunResult & { ranking: Ranking };

const EMPTY_RANKING: Ranking = {
  entries: [],
  page: 0,
  pages: 1,
  totalPlayers: 0,
  currentRank: null,
  percentile: null,
  best: null,
};

const leaderboardCacheKey = (boardId: string, page: number): string =>
  `${boardId}:${page}`;

const discoveryCacheKey = (
  boardId: string,
  page: number,
  take: number
): string => `${boardId}:${take}:${page}`;

const ResultSummary = ({
  result,
  showBest = true,
}: {
  result: Completed;
  showBest?: boolean;
}) => (
  <div className="result-summary">
    <h1>{result.score.toLocaleString('en-US')}</h1>
    {showBest && (
      <p>
        Best score:{' '}
        {result.ranking.best?.score.toLocaleString('en-US') ??
          result.score.toLocaleString('en-US')}
      </p>
    )}
    <p>Better than {result.ranking.percentile ?? 0}% of players</p>
    <p>
      Current rank:{' '}
      {result.ranking.currentRank ? `#${result.ranking.currentRank}` : '-'}
    </p>
  </div>
);

const ResultShell = ({
  result,
  showBest = true,
  children,
}: {
  result: Completed;
  showBest?: boolean;
  children: ReactNode;
}) => (
  <section className="screen result-screen">
    <div className="result-content">
      <ResultSummary result={result} showBest={showBest} />
      {children}
    </div>
  </section>
);

const PlayView = ({
  board,
  muted,
  onSound,
  onEngine,
  onExit,
  onFinish,
}: {
  board: Board;
  muted: boolean;
  onSound: () => void;
  onEngine: (engine: ArtBreakerEngine | null) => void;
  onExit?: () => void;
  onFinish: (result: RunResult) => void;
}) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<ArtBreakerEngine | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [hud, setHud] = useState<GameHud>({
    score: 0,
    combo: 0,
    remaining: board.cells.filter(Boolean).length,
  });
  const [status, setStatus] = useState<
    'ready' | 'running' | 'paused' | 'finished'
  >('ready');
  const [clearResult, setClearResult] = useState<RunResult | null>(null);
  const [clearStage, setClearStage] = useState(0);
  const finishGame = useCallback(
    (result: RunResult) => {
      if (!result.cleared) {
        onFinish(result);
        return;
      }
      setStatus('finished');
      setClearStage(0);
      setClearResult(result);
    },
    [onFinish]
  );
  useEffect(() => {
    if (!canvas.current) return;
    const instance = new ArtBreakerEngine(canvas.current, board, {
      onHud: setHud,
      onFinish: finishGame,
    });
    // Carry the persisted preference into every newly created audio engine.
    instance.setMuted(mutedRef.current);
    engine.current = instance;
    onEngine(instance);
    return () => {
      instance.destroy();
      engine.current = null;
      onEngine(null);
    };
  }, [board, finishGame, onEngine]);
  useEffect(() => {
    if (!clearResult) return;
    const reducedMotion = matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const interval = reducedMotion ? 180 : 650;
    const timers = [1, 2, 3, 4].map((stage) =>
      window.setTimeout(() => {
        setClearStage(stage);
        engine.current?.playClearRevealSound(stage - 1);
      }, stage * interval)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [clearResult]);
  useEffect(() => {
    engine.current?.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden && engine.current?.status === 'running')
        setStatus('paused');
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  const touchInput = matchMedia('(pointer: coarse)').matches;
  const playAction = touchInput ? 'Press to play' : 'Click to play';
  const moveInstruction = touchInput
    ? 'Move with your finger'
    : 'Move with your mouse or arrow keys';
  const resumeAction = touchInput ? 'Tap' : 'Click';
  const start = async () => {
    await engine.current?.startOrResume();
    setStatus('running');
  };
  const pause = () => {
    engine.current?.pause();
    setStatus('paused');
  };
  const clearAccuracy = clearResult
    ? accuracyFor(clearResult.accuracyHits, clearResult.accuracyAttempts)
    : 0;
  const displayedScore = clearResult ? clearResult.baseScore : hud.score;
  return (
    <section className="screen play-screen">
      <div className="game-stage">
        <div className="play-hud">
          <div>
            <small>SCORE</small>
            <strong>{displayedScore.toLocaleString('en-US')}</strong>
          </div>
          <div>
            <small>COMBO</small>
            <strong>×{hud.combo}</strong>
          </div>
          <div className="play-hud-actions">
            <button
              className="compact-header-button pause-button"
              type="button"
              disabled={status !== 'running'}
              aria-label="Pause game"
              onClick={pause}
            >
              <span className="pause-icon" aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-pressed={muted}
              aria-label={muted ? 'Turn sound on' : 'Mute sound'}
              onClick={onSound}
            >
              <span className="sound-icon" aria-hidden="true">
                ♪
              </span>
            </button>
            {onExit && (
              <button
                className="compact-header-button preview-close-button"
                type="button"
                aria-label="Close preview and return to editor"
                onClick={onExit}
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="game-canvas-frame">
          <canvas
            ref={canvas}
            width={400}
            height={700}
            aria-label="Art Breaker playfield"
          />
          {status === 'ready' && (
            <button
              className="game-overlay"
              type="button"
              onClick={() => void start()}
            >
              <span>READY?</span>
              <strong>{playAction}</strong>
              <small>{moveInstruction}</small>
            </button>
          )}
          {status === 'paused' && (
            <button
              className="game-overlay paused-overlay"
              type="button"
              onClick={() => void start()}
            >
              <strong>Paused</strong>
              <small>{resumeAction} to resume</small>
            </button>
          )}
          {clearResult && (
            <div
              className={`clear-bonus-overlay clear-stage-${clearStage}`}
              aria-live="polite"
            >
              <span className="clear-kicker">BOARD CLEAR</span>
              <strong>{clearResult.baseScore.toLocaleString('en-US')}</strong>
              <div className="clear-bonus-lines">
                <p
                  className={clearStage >= 1 ? 'is-visible' : ''}
                  aria-hidden={clearStage < 1}
                >
                  <span>Clear bonus</span>
                  <b>×{CLEAR_SCORE_MULTIPLIER.toFixed(2)}</b>
                </p>
                <p
                  className={clearStage >= 2 ? 'is-visible' : ''}
                  aria-hidden={clearStage < 2}
                >
                  <span>Accuracy</span>
                  <b>{formatAccuracyPercent(clearAccuracy)}</b>
                </p>
                <p
                  className={clearStage >= 3 ? 'is-visible' : ''}
                  aria-hidden={clearStage < 3}
                >
                  <span>Accuracy bonus</span>
                  <b>×{(1 + clearAccuracy).toFixed(2)}</b>
                </p>
              </div>
              <div
                className={cn('clear-total', {
                  'is-visible': clearStage >= 4,
                })}
                aria-hidden={clearStage < 4}
              >
                <small>FINAL SCORE</small>
                <strong>{clearResult.score.toLocaleString('en-US')}</strong>
              </div>
              <div className="clear-next-slot">
                <button
                  className={cn('arcade-button primary clear-next-button', {
                    'is-visible': clearStage >= 4,
                  })}
                  type="button"
                  disabled={clearStage < 4}
                  aria-hidden={clearStage < 4}
                  onClick={() => onFinish(clearResult)}
                >
                  NEXT
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export const App = () => {
  const deviceId = useMemo(() => getDeviceId(), []);
  const intendedView = useMemo(() => {
    const stored = localStorage.getItem('art-breaker-intended-view');
    return stored === 'create' || stored === 'leaderboard' ? stored : 'play';
  }, []);
  const intendedCreate = intendedView === 'create';
  const [session, setSession] = useState<Session | null>(null);
  const [editorSession, setEditorSession] = useState<EditorSession | null>(
    null
  );
  const [view, setView] = useState<View>(intendedView);
  const [activeBoard, setActiveBoard] = useState<Board | null>(() =>
    intendedCreate ? null : readCachedPlayBoard(context.postId)
  );
  const [previewBoard, setPreviewBoard] = useState<Board | null>(null);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [muted, setMuted] = useState(
    () => localStorage.getItem('art-breaker-sound') === 'off'
  );
  const [notice, setNotice] = useState('');
  const [comment, setComment] = useState('');
  const [shareAttempted, setShareAttempted] = useState(false);
  const [leaderboardPage, setLeaderboardPage] = useState(0);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [standaloneRanking, setStandaloneRanking] = useState<Ranking | null>(
    null
  );
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [morePage, setMorePage] = useState(0);
  const [createSignInDialog, setCreateSignInDialog] = useState(false);
  const engine = useRef<ArtBreakerEngine | null>(null);
  const hadCachedBoard = useRef(activeBoard !== null);
  const sessionRequest = useRef<Promise<Session> | null>(null);
  const editorSessionRequest = useRef<Promise<EditorSession> | null>(null);
  const leaderboardCache = useRef(new QueryCache<Ranking>(20_000));
  const discoveryCache = useRef(new QueryCache<Discovery>(60_000));
  const leaderboardTarget = useRef('');
  const discoveryTarget = useRef('');

  const requestSession = useCallback(() => {
    const current = sessionRequest.current;
    if (current) return current;
    const request = trpc.session.summary.query({ deviceId });
    sessionRequest.current = request;
    void request.catch(() => {
      if (sessionRequest.current === request) sessionRequest.current = null;
    });
    return request;
  }, [deviceId]);
  const requestEditorSession = useCallback(() => {
    const current = editorSessionRequest.current;
    if (current) return current;
    const request = trpc.session.editor.query({ deviceId });
    editorSessionRequest.current = request;
    void request.catch(() => {
      if (editorSessionRequest.current === request)
        editorSessionRequest.current = null;
    });
    return request;
  }, [deviceId]);

  useEffect(() => {
    localStorage.removeItem('art-breaker-intended-view');
    void trpc.current.board
      .query()
      .then((board) => {
        setActiveBoard((current) =>
          current?.id === board.id && current.boardHash === board.boardHash
            ? current
            : board
        );
      })
      .catch((error) => {
        if (!hadCachedBoard.current) setNotice(messageOf(error));
      });
    if (intendedCreate) {
      void requestEditorSession()
        .then((data) => {
          setSession(data);
          if (data.user.authenticated) setEditorSession(data);
          else {
            setView('play');
            setCreateSignInDialog(true);
          }
        })
        .catch((error) => setNotice(messageOf(error)));
    } else
      void requestSession()
        .then(setSession)
        .catch(() => undefined);
  }, [intendedCreate, requestEditorSession, requestSession]);

  const onEngine = useCallback((instance: ArtBreakerEngine | null) => {
    engine.current = instance;
  }, []);
  const requestLeaderboard = useCallback(
    (boardId: string, page: number) =>
      leaderboardCache.current.load(leaderboardCacheKey(boardId, page), () =>
        trpc.scores.leaderboard.query({ deviceId, boardId, page })
      ),
    [deviceId]
  );
  const prefetchLeaderboard = useCallback(
    (boardId: string, page: number, pages: number) => {
      for (const adjacent of [page - 1, page + 1]) {
        if (adjacent < 0 || adjacent >= pages) continue;
        const key = leaderboardCacheKey(boardId, adjacent);
        if (leaderboardCache.current.read(key)?.fresh) continue;
        void requestLeaderboard(boardId, adjacent).catch(() => undefined);
      }
    },
    [requestLeaderboard]
  );
  const requestDiscovery = useCallback(
    (boardId: string, page: number, take: 4 | 6) =>
      discoveryCache.current.load(discoveryCacheKey(boardId, page, take), () =>
        trpc.boards.discover.query({
          deviceId,
          currentId: boardId,
          page,
          take,
        })
      ),
    [deviceId]
  );
  const prefetchDiscovery = useCallback(
    (boardId: string, page: number, take: 4 | 6, pages: number) => {
      for (const adjacent of [page - 1, page + 1]) {
        if (adjacent < 0 || adjacent >= pages) continue;
        const key = discoveryCacheKey(boardId, adjacent, take);
        if (discoveryCache.current.read(key)?.fresh) continue;
        void requestDiscovery(boardId, adjacent, take).catch(() => undefined);
      }
    },
    [requestDiscovery]
  );
  const finish = useCallback(
    (result: RunResult) => {
      if (view === 'preview-play') {
        setPreviewBoard(null);
        setView('create');
        return;
      }
      if (!activeBoard) return;
      const boardId = activeBoard.id;
      leaderboardCache.current.invalidate((key) =>
        key.startsWith(`${boardId}:`)
      );
      setShareAttempted(false);
      setLeaderboardPage(0);
      setView('score-loading');
      void trpc.scores.submit
        .mutate({ deviceId, run: { boardId, ...result } })
        .then(({ leaderboard, user }) => {
          setSession(
            (current) =>
              current ?? {
                user: {
                  username: user.username,
                  authenticated: user.authenticated,
                },
                subredditName: context.subredditName,
                postId: context.postId,
              }
          );
          leaderboardCache.current.set(
            leaderboardCacheKey(boardId, 0),
            leaderboard
          );
          prefetchLeaderboard(boardId, 0, leaderboard.pages);
          setCompleted({ ...result, ranking: leaderboard });
          setView(
            !user.authenticated
              ? 'result-sign-in'
              : user.subscribed
                ? 'result-comment'
                : 'result-join'
          );
        })
        .catch(async (error) => {
          const currentSession =
            session ??
            (await sessionRequest.current?.catch(() => null)) ??
            null;
          const ranking = EMPTY_RANKING;
          leaderboardCache.current.set(
            leaderboardCacheKey(boardId, 0),
            ranking
          );
          setNotice(messageOf(error));
          setCompleted({ ...result, ranking });
          setView(
            !currentSession?.user.authenticated
              ? 'result-sign-in'
              : 'result-comment'
          );
        });
    },
    [activeBoard, deviceId, prefetchLeaderboard, session, view]
  );

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('art-breaker-sound', next ? 'off' : 'on');
    engine.current?.setMuted(next);
  };
  const playBoard = (board: Board) => {
    setActiveBoard(board);
    setCompleted(null);
    setView('play');
  };
  const playPreview = (board: Board) => {
    setPreviewBoard(board);
    setView('preview-play');
  };
  const exitPreview = () => {
    setPreviewBoard(null);
    setView('create');
  };
  const openCreate = () => {
    if (!session) {
      void requestEditorSession()
        .then((data) => {
          setSession(data);
          if (data.user.authenticated) {
            setEditorSession(data);
            setView('create');
          } else setCreateSignInDialog(true);
        })
        .catch((error) => setNotice(messageOf(error)));
      return;
    }
    if (!session?.user.authenticated) {
      setCreateSignInDialog(true);
      return;
    }
    setView('create');
    if (!editorSession) {
      void requestEditorSession()
        .then((data) => {
          setSession(data);
          if (data.user.authenticated) setEditorSession(data);
          else {
            setView('play');
            setCreateSignInDialog(true);
          }
        })
        .catch((error) => setNotice(messageOf(error)));
    }
  };
  const signInFromExpanded = (event: MouseEvent<HTMLButtonElement>) => {
    startRedditLogin(event.nativeEvent);
  };
  const signInToCreate = (event: MouseEvent<HTMLButtonElement>) => {
    setCreateSignInDialog(false);
    signInFromExpanded(event);
  };
  const join = async () => {
    try {
      await trpc.social.join.mutate({ deviceId });
    } catch (error) {
      console.error('Join unavailable; continuing.', error);
    }
    setView('result-comment');
  };
  const submitComment = async () => {
    if (!completed || !activeBoard) return;
    setNotice('');
    try {
      await trpc.social.comment.mutate({
        deviceId,
        boardId: activeBoard.id,
        customText: comment,
        score: completed.score,
        elapsedMs: completed.elapsedMs,
        cleared: completed.cleared,
        submissionId: crypto.randomUUID(),
      });
      setView('result-share');
    } catch (error) {
      setNotice(messageOf(error));
    }
  };
  const share = async () => {
    setShareAttempted(true);
    setNotice('');
    try {
      await showShareSheet({
        post: context.postId,
        title: activeBoard?.title,
        text: 'Play this Art Breaker board!',
      });
    } catch (error) {
      setNotice(messageOf(error));
    }
  };
  const loadLeaderboard = useCallback(
    async (page: number) => {
      if (!activeBoard) return;
      const boardId = activeBoard.id;
      const key = leaderboardCacheKey(boardId, page);
      const cached = leaderboardCache.current.read(key);
      leaderboardTarget.current = key;
      setLeaderboardPage(page);
      const showRanking = (ranking: Ranking) => {
        if (!completed) {
          setStandaloneRanking(ranking);
          return;
        }
        setCompleted((current) =>
          current
            ? {
                ...current,
                ranking: session?.user.authenticated
                  ? ranking
                  : { ...ranking, percentile: current.ranking.percentile },
              }
            : current
        );
      };
      if (cached) {
        showRanking(cached.data);
        setLeaderboardLoading(false);
        prefetchLeaderboard(boardId, page, cached.data.pages);
        if (cached.fresh) return;
      } else {
        setLeaderboardLoading(true);
      }
      try {
        const ranking = await requestLeaderboard(boardId, page);
        if (leaderboardTarget.current !== key) return;
        showRanking(ranking);
        prefetchLeaderboard(boardId, page, ranking.pages);
      } catch (error) {
        if (!cached && leaderboardTarget.current === key) {
          setNotice(messageOf(error));
          if (!completed) setStandaloneRanking(EMPTY_RANKING);
        }
      } finally {
        if (leaderboardTarget.current === key) setLeaderboardLoading(false);
      }
    },
    [
      activeBoard,
      completed,
      prefetchLeaderboard,
      requestLeaderboard,
      session?.user.authenticated,
    ]
  );
  useEffect(() => {
    if (
      view !== 'leaderboard' ||
      !activeBoard ||
      standaloneRanking ||
      leaderboardTarget.current === leaderboardCacheKey(activeBoard.id, 0)
    )
      return;
    void loadLeaderboard(0);
  }, [activeBoard, loadLeaderboard, standaloneRanking, view]);
  const loadMore = async (page: number) => {
    if (!activeBoard) return;
    const boardId = activeBoard.id;
    const take = matchMedia('(min-width: 700px)').matches ? 6 : 4;
    const key = discoveryCacheKey(boardId, page, take);
    const cached = discoveryCache.current.read(key);
    discoveryTarget.current = key;
    setMorePage(page);
    setNotice('');
    setView('more');
    if (cached) {
      setDiscovery(cached.data);
      prefetchDiscovery(boardId, page, take, cached.data.pages);
      if (cached.fresh) return;
    } else {
      setDiscovery(null);
    }
    try {
      const data = await requestDiscovery(boardId, page, take);
      if (discoveryTarget.current !== key) return;
      setDiscovery(data);
      prefetchDiscovery(boardId, page, take, data.pages);
    } catch (error) {
      if (!cached && discoveryTarget.current === key)
        setNotice(messageOf(error));
    }
  };

  if (!activeBoard || (view === 'create' && !editorSession))
    return (
      <main
        className="app-shell expanded-loading board-loading"
        role="status"
        aria-live="polite"
      >
        <BoardLoader label={notice || 'Loading Art Breaker…'} />
      </main>
    );
  if (view === 'score-loading')
    return (
      <main
        className="app-shell expanded-loading board-loading"
        role="status"
        aria-live="polite"
      >
        <BoardLoader label="Loading results…" />
      </main>
    );
  return (
    <main
      className={cn('app-shell', {
        'create-shell': view === 'create',
        'play-shell': view === 'play' || view === 'preview-play',
        'result-shell': view.startsWith('result') || view === 'leaderboard',
        'more-shell': view === 'more',
      })}
    >
      {view !== 'create' &&
        view !== 'play' &&
        view !== 'preview-play' &&
        view !== 'more' && (
          <Header
            className="post-play-header"
            muted={muted}
            onSound={toggleSound}
          />
        )}
      {view === 'play' && (
        <PlayView
          board={activeBoard}
          muted={muted}
          onSound={toggleSound}
          onEngine={onEngine}
          onFinish={finish}
        />
      )}
      {view === 'preview-play' && previewBoard && (
        <PlayView
          board={previewBoard}
          muted={muted}
          onSound={toggleSound}
          onEngine={onEngine}
          onExit={exitPreview}
          onFinish={finish}
        />
      )}
      {editorSession &&
        ((view === 'create' && editorSession.user.authenticated) ||
          view === 'preview-play') && (
          <Editor
            bootstrap={editorSession}
            deviceId={deviceId}
            muted={muted}
            hidden={view === 'preview-play'}
            onBack={() => setView(completed ? 'results' : 'play')}
            onPlay={playPreview}
            onSound={toggleSound}
          />
        )}
      {completed && view === 'result-sign-in' && (
        <ResultShell result={completed} showBest={false}>
          <div className="result-prompt">
            <h2>Sign in</h2>
            <p>
              Sign in to Reddit to save your score and create your own boards.
            </p>
            <div className="button-row">
              <ArcadeButton tone="primary" onClick={signInFromExpanded}>
                SIGN IN
              </ArcadeButton>
              <ArcadeButton onClick={() => setView('results')}>
                SKIP
              </ArcadeButton>
            </div>
          </div>
        </ResultShell>
      )}
      {session && completed && view === 'result-join' && (
        <ResultShell result={completed}>
          <div className="result-prompt">
            <h2>Join r/{session.subredditName}</h2>
            <p>
              Join the subreddit so you do not miss future boards and game
              updates.
            </p>
            <div className="button-row">
              <ArcadeButton tone="primary" onClick={() => void join()}>
                <span className="join-label-long">
                  JOIN r/{session.subredditName}
                </span>
                <span className="join-label-short">JOIN</span>
              </ArcadeButton>
              <ArcadeButton onClick={() => setView('result-comment')}>
                SKIP
              </ArcadeButton>
            </div>
          </div>
        </ResultShell>
      )}
      {session && completed && view === 'result-comment' && (
        <ResultShell result={completed}>
          <div className="result-prompt">
            <h2>Leave a comment</h2>
            <textarea
              value={comment}
              maxLength={500}
              placeholder="Flex your skills here..."
              onChange={(event) => setComment(event.target.value)}
            />
            <div className="automatic">
              <p>
                <span>Automatically added: </span>
                <strong>
                  {formatAutomaticScoreComment(
                    completed.score,
                    completed.elapsedMs,
                    completed.cleared
                  )}
                </strong>
              </p>
              <p>
                Commenting as {session.user.username ?? 'your Reddit username'}
              </p>
            </div>
            <div className="button-row">
              <ArcadeButton tone="primary" onClick={() => void submitComment()}>
                SUBMIT COMMENT
              </ArcadeButton>
              <ArcadeButton onClick={() => setView('result-share')}>
                SKIP
              </ArcadeButton>
            </div>
            {notice && <p className="notice">{notice}</p>}
          </div>
        </ResultShell>
      )}
      {completed && view === 'result-share' && (
        <ResultShell result={completed}>
          <div className="result-prompt">
            <h2>Share with a friend</h2>
            <p>
              Send them a link to this puzzle.
              <br />
              They don't need Reddit to play.
            </p>
            <div className="button-row">
              <ArcadeButton tone="primary" onClick={() => void share()}>
                SHARE
              </ArcadeButton>
              <ArcadeButton onClick={() => setView('results')}>
                {shareAttempted ? 'DONE' : 'SKIP'}
              </ArcadeButton>
            </div>
            {notice && <p className="notice">{notice}</p>}
          </div>
        </ResultShell>
      )}
      {completed && view === 'results' && (
        <section className="screen results-screen">
          <div className="results-content">
            <ResultSummary
              result={completed}
              showBest={session?.user.authenticated ?? false}
            />
            <Leaderboard
              loading={leaderboardLoading}
              ranking={completed.ranking}
              page={leaderboardPage}
              onPage={loadLeaderboard}
            />
            <div className="button-row wrap">
              <ArcadeButton
                tone="primary"
                onClick={() => playBoard(activeBoard)}
              >
                PLAY AGAIN
              </ArcadeButton>
              <ArcadeButton tone="blue" onClick={openCreate}>
                CREATE
              </ArcadeButton>
              <ArcadeButton onClick={() => void loadMore(0)}>MORE</ArcadeButton>
            </div>
          </div>
        </section>
      )}
      {view === 'leaderboard' && (
        <section className="screen results-screen standalone-leaderboard-screen">
          <div className="results-content">
            <Leaderboard
              loading={leaderboardLoading || !standaloneRanking}
              ranking={standaloneRanking ?? EMPTY_RANKING}
              page={leaderboardPage}
              onPage={loadLeaderboard}
            />
            <div className="button-row">
              <ArcadeButton
                tone="primary"
                onClick={() => playBoard(activeBoard)}
              >
                PLAY
              </ArcadeButton>
              <ArcadeButton tone="blue" onClick={openCreate}>
                CREATE
              </ArcadeButton>
              <ArcadeButton onClick={() => void loadMore(0)}>MORE</ArcadeButton>
            </div>
          </div>
        </section>
      )}
      {view === 'more' && (
        <MoreBoards
          data={discovery}
          error={notice}
          page={morePage}
          onBack={() => setView(completed ? 'results' : 'leaderboard')}
          onPage={loadMore}
        />
      )}
      {createSignInDialog && (
        <div className="modal-backdrop">
          <section
            className="sign-in-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-sign-in-title"
          >
            <h2 id="create-sign-in-title">Sign in to create</h2>
            <p>Sign in to Reddit to make your own Art Breaker board.</p>
            <div className="button-row">
              <ArcadeButton onClick={() => setCreateSignInDialog(false)}>
                CANCEL
              </ArcadeButton>
              <ArcadeButton tone="blue" onClick={signInToCreate}>
                SIGN IN
              </ArcadeButton>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

const Leaderboard = ({
  loading,
  ranking,
  page,
  onPage,
}: {
  loading: boolean;
  ranking: Ranking;
  page: number;
  onPage: (page: number) => Promise<void>;
}) => (
  <section className="leaderboard">
    <h2>Leaderboard</h2>
    {loading ? (
      <div
        className="screen-loading board-loading"
        role="status"
        aria-live="polite"
      >
        <BoardLoader label="Loading leaderboard…" />
      </div>
    ) : (
      <>
        <ol start={page * 10 + 1}>
          {ranking.entries.length ? (
            ranking.entries.map((entry) => (
              <li key={`${entry.rank}-${entry.username}`}>
                <span>
                  #{entry.rank} u/{entry.username}
                  {entry.cleared && (
                    <b className="leaderboard-clear" aria-label="Board cleared">
                      {' ⚑'}
                    </b>
                  )}
                </span>
                <strong>{entry.score.toLocaleString('en-US')}</strong>
                <small>{formatTime(entry.elapsedMs)}</small>
              </li>
            ))
          ) : (
            <li className="leaderboard-empty">No scores yet.</li>
          )}
        </ol>
        <div className="pager">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => void onPage(page - 1)}
          >
            ← PREV
          </button>
          <span>
            {page + 1} / {ranking.pages}
          </span>
          <button
            type="button"
            disabled={page + 1 >= ranking.pages}
            onClick={() => void onPage(page + 1)}
          >
            NEXT →
          </button>
        </div>
      </>
    )}
  </section>
);

const MoreBoards = ({
  data,
  error,
  page,
  onBack,
  onPage,
}: {
  data: Discovery | null;
  error: string;
  page: number;
  onBack: () => void;
  onPage: (page: number) => Promise<void>;
}) => (
  <section className="screen more-screen">
    <div className="screen-header">
      <button className="back-button" type="button" onClick={onBack}>
        ←
      </button>
      <h1>Play more boards</h1>
    </div>
    {!data && !error ? (
      <div
        className="screen-loading board-loading"
        role="status"
        aria-live="polite"
      >
        <BoardLoader label="Loading more boards…" />
      </div>
    ) : error ? (
      <p className="notice">{error}</p>
    ) : (
      <>
        <div className="more-board-area">
          {data?.boards.length ? (
            <div className="board-grid">
              {data.boards.map((board) => (
                <button
                  key={board.id}
                  className="board-card"
                  type="button"
                  onClick={() =>
                    board.permalink && navigateTo(redditUrl(board.permalink))
                  }
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
            <p className="notice">No more published boards yet.</p>
          )}
        </div>
        <div className="pager">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => void onPage(page - 1)}
          >
            ← PREV
          </button>
          <span>
            {page + 1} / {data?.pages ?? 1}
          </span>
          <button
            type="button"
            disabled={!data || page + 1 >= data.pages}
            onClick={() => void onPage(page + 1)}
          >
            NEXT →
          </button>
        </div>
      </>
    )}
  </section>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
