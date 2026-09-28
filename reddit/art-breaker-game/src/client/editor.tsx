import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { context, navigateTo } from '@devvit/web/client';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../server/trpc';
import {
  EDITOR_COLUMNS,
  EDITOR_PALETTE_ORDER,
  EDITOR_ROWS,
  FORMAT_VERSION,
  PALETTE,
  RULESET_VERSION,
  gameplaySeedFor,
  type Board,
} from '../shared/game';
import { trpc } from './trpc';
import { ArcadeButton, BoardLoader } from './chrome';
import { BoardCanvas } from './board-canvas';
import { cn, messageOf, redditUrl } from './utils';
import { boardNameIssue, type BoardNameIssue } from '../shared/text-safety';

type Bootstrap = inferRouterOutputs<AppRouter>['session']['editor'];
type MyBoards = inferRouterOutputs<AppRouter>['boards']['mine'];
type AdminData = inferRouterOutputs<AppRouter>['admin']['overview'];

type EditorProps = {
  bootstrap: Bootstrap;
  deviceId: string;
  muted: boolean;
  hidden?: boolean;
  onBack: () => void;
  onPlay: (board: Board) => void;
  onSound: () => void;
};

const blank = (): number[] =>
  new Array<number>(EDITOR_COLUMNS * EDITOR_ROWS).fill(0);

export const Editor = ({
  bootstrap,
  deviceId,
  muted,
  hidden = false,
  onBack,
  onPlay,
  onSound,
}: EditorProps) => {
  const [cells, setCellsState] = useState(blank);
  const cellsRef = useRef(cells);
  const [selected, setSelected] = useState(1);
  const [undo, setUndo] = useState<number[][]>([]);
  const [redo, setRedo] = useState<number[][]>([]);
  const [title, setTitle] = useState('');
  const [draftId, setDraftId] = useState<string>();
  const [preview, setPreview] = useState(false);
  const [publishDialog, setPublishDialog] = useState<
    'user' | 'now' | 'queue' | null
  >(null);
  const [publishName, setPublishName] = useState('');
  const [publishValidation, setPublishValidation] =
    useState<BoardNameIssue>(null);
  const [publishError, setPublishError] = useState('');
  const [publishComplete, setPublishComplete] = useState(false);
  const [section, setSection] = useState<'draw' | 'mine' | 'admin'>('draw');
  const [myBoards, setMyBoards] = useState<MyBoards | null>(null);
  const [myBoardsLoading, setMyBoardsLoading] = useState(false);
  const [myBoardsError, setMyBoardsError] = useState('');
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const dragging = useRef(false);
  const strokeValue = useRef(0);
  const startIndex = useRef(-1);
  const longTimer = useRef(0);
  const noticeTimer = useRef(0);
  const sourceBoard = useRef<number[]>([]);

  const setCells = (next: number[]) => {
    cellsRef.current = next;
    setCellsState(next);
  };
  const cancelLongPress = () => {
    window.clearTimeout(longTimer.current);
    longTimer.current = 0;
    startIndex.current = -1;
  };

  useEffect(
    () => () => {
      window.clearTimeout(longTimer.current);
      window.clearTimeout(noticeTimer.current);
    },
    []
  );

  const showNotice = (message: string, error = false) => {
    window.clearTimeout(noticeTimer.current);
    setNoticeError(error);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2200);
  };

  const paint = (index: number, value: number) => {
    const current = cellsRef.current;
    if (current[index] === value) return;
    const next = [...current];
    next[index] = value;
    setCells(next);
  };

  const fill = (index: number, source: number[], value: number) => {
    const sourceValue = source[index];
    const next = [...cellsRef.current];
    const pending = [index];
    const visited = new Uint8Array(source.length);
    while (pending.length) {
      const current = pending.pop();
      if (
        current === undefined ||
        visited[current] ||
        source[current] !== sourceValue
      )
        continue;
      visited[current] = 1;
      next[current] = value;
      const row = Math.floor(current / EDITOR_COLUMNS);
      const column = current % EDITOR_COLUMNS;
      if (row > 0) pending.push(current - EDITOR_COLUMNS);
      if (row < EDITOR_ROWS - 1) pending.push(current + EDITOR_COLUMNS);
      if (column > 0) pending.push(current - 1);
      if (column < EDITOR_COLUMNS - 1) pending.push(current + 1);
    }
    setCells(next);
  };

  const beginStroke = (
    index: number,
    event?: PointerEvent<HTMLButtonElement>
  ) => {
    event?.preventDefault();
    if (event)
      event.currentTarget.parentElement?.setPointerCapture(event.pointerId);
    cancelLongPress();
    const source = [...cellsRef.current];
    sourceBoard.current = source;
    setUndo((items) => [...items.slice(-99), source]);
    setRedo([]);
    const value = source[index] === selected ? 0 : selected;
    strokeValue.current = value;
    startIndex.current = index;
    dragging.current = true;
    paint(index, value);
    longTimer.current = window.setTimeout(() => {
      if (!dragging.current || startIndex.current !== index) return;
      fill(index, source, value);
      dragging.current = false;
      cancelLongPress();
    }, 550);
  };

  const moveStroke = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (
      !(target instanceof HTMLElement) ||
      !target.classList.contains('editor-cell')
    ) {
      cancelLongPress();
      return;
    }
    const index = Number(target.dataset.index);
    if (index !== startIndex.current) cancelLongPress();
    paint(index, strokeValue.current);
  };

  const endStroke = () => {
    dragging.current = false;
    cancelLongPress();
  };
  const keyboardPaint = (index: number) => {
    const source = [...cellsRef.current];
    setUndo((items) => [...items.slice(-99), source]);
    setRedo([]);
    paint(index, source[index] === selected ? 0 : selected);
  };
  const undoOnce = () => {
    const previous = undo[undo.length - 1];
    if (!previous) return;
    setRedo((items) => [...items, [...cellsRef.current]]);
    setUndo((items) => items.slice(0, -1));
    setCells([...previous]);
  };
  const redoOnce = () => {
    const next = redo[redo.length - 1];
    if (!next) return;
    setUndo((items) => [...items, [...cellsRef.current]]);
    setRedo((items) => items.slice(0, -1));
    setCells([...next]);
  };
  const clear = () => {
    if (!cells.some(Boolean)) return;
    setUndo((items) => [...items, [...cells]]);
    setRedo([]);
    setCells(blank());
  };

  const draftBoard = (): Board => ({
    id: draftId ?? 'local-preview',
    formatVersion: FORMAT_VERSION,
    rulesetVersion: RULESET_VERSION,
    columns: EDITOR_COLUMNS,
    rows: EDITOR_ROWS,
    cells,
    boardHash: 'local-preview',
    gameplaySeed: gameplaySeedFor(cells, EDITOR_COLUMNS, EDITOR_ROWS),
    title: title.trim() || 'Custom Art Breaker',
    creatorId: 'local',
    creatorUsername: bootstrap.user.username ?? 'Guest',
    creatorRole: bootstrap.user.moderator ? 'moderator' : 'user',
    status: 'draft',
    createdAt: 0,
    updatedAt: 0,
  });
  const playPreview = () => {
    setPreview(false);
    onPlay(draftBoard());
  };

  const payload = (nextTitle = title) => ({
    deviceId,
    boardId: draftId,
    board: { cells, title: nextTitle.trim() || undefined },
  });
  const save = async () => {
    setBusy(true);
    setNotice('');
    try {
      const board = await trpc.boards.saveDraft.mutate(payload());
      setDraftId(board.id);
      showNotice('Draft saved.');
    } catch (error) {
      showNotice(messageOf(error), true);
    } finally {
      setBusy(false);
    }
  };
  const openPublish = (mode: 'user' | 'now' | 'queue') => {
    setPublishName(title.trim());
    setPublishValidation(null);
    setPublishError('');
    setPublishComplete(false);
    setPublishDialog(mode);
  };
  const closePublish = () => {
    if (busy) return;
    setPublishDialog(null);
    setPublishValidation(null);
    setPublishError('');
    setPublishComplete(false);
  };
  const publish = async (queuePosition?: 'front' | 'back') => {
    if (!publishDialog) return;
    if (publishDialog === 'queue' && !queuePosition) return;
    const validation = boardNameIssue(publishName);
    if (validation) {
      setPublishValidation(validation);
      return;
    }
    const mode = publishDialog;
    setBusy(true);
    setNotice('');
    try {
      const board =
        mode === 'queue' && queuePosition
          ? await trpc.boards.addToQueue.mutate({
              ...payload(publishName),
              position: queuePosition,
            })
          : mode === 'now'
            ? await trpc.boards.publishNow.mutate(payload(publishName))
            : await trpc.boards.publish.mutate(payload(publishName));
      setTitle(publishName.trim());
      if (mode === 'queue') {
        const updatedAdmin = await trpc.admin.overview.query({ deviceId });
        setAdmin(updatedAdmin);
        setPublishDialog(null);
        setSection('admin');
        return;
      }
      setPublishComplete(true);
      await new Promise((resolve) => window.setTimeout(resolve, 600));
      if (board.permalink) navigateTo(redditUrl(board.permalink));
      else setPublishDialog(null);
    } catch (error) {
      const detail = messageOf(error).replace(/[.!]+$/, '');
      setPublishError(`An error was encountered: ${detail}.`);
    } finally {
      setBusy(false);
    }
  };
  const loadMine = async () => {
    setSection('mine');
    setMyBoards(null);
    setMyBoardsError('');
    setMyBoardsLoading(true);
    try {
      setMyBoards(await trpc.boards.mine.query({ deviceId }));
    } catch (error) {
      setMyBoardsError(messageOf(error));
    } finally {
      setMyBoardsLoading(false);
    }
  };
  const loadAdmin = async () => {
    setSection('admin');
    setAdmin(null);
    setAdminError('');
    setAdminLoading(true);
    try {
      setAdmin(await trpc.admin.overview.query({ deviceId }));
    } catch (error) {
      setAdminError(messageOf(error));
    } finally {
      setAdminLoading(false);
    }
  };
  const resume = (board: Board, retainId = true) => {
    setCells([...board.cells]);
    setTitle(board.title === 'Custom Art Breaker' ? '' : board.title);
    setDraftId(retainId ? board.id : undefined);
    setUndo([]);
    setRedo([]);
    setSection('draw');
  };

  if (section === 'mine')
    return (
      <BoardList
        data={myBoards}
        deviceId={deviceId}
        error={myBoardsError}
        loading={myBoardsLoading}
        onBack={() => setSection('draw')}
        onResume={resume}
      />
    );
  if (section === 'admin')
    return (
      <AdminView
        data={admin}
        deviceId={deviceId}
        error={adminError}
        loading={adminLoading}
        onBack={() => setSection('draw')}
        onResume={(board) => resume(board, false)}
      />
    );

  const count = cells.filter(Boolean).length;
  return (
    <section className="screen editor-screen" hidden={hidden}>
      <div className="screen-header editor-header">
        <div className="editor-back-group">
          <button
            className="back-button"
            type="button"
            aria-label="Back"
            onClick={onBack}
          >
            ←
          </button>
          {bootstrap.user.moderator && (
            <span className="editor-app-version">v{context.appVersion}</span>
          )}
        </div>
        <div className="editor-header-actions">
          {bootstrap.user.authenticated && (
            <button
              className="compact-header-button"
              type="button"
              aria-label="My boards"
              onClick={() => void loadMine()}
            >
              MY
            </button>
          )}
          {bootstrap.user.moderator && (
            <button
              className="compact-header-button new-button"
              type="button"
              aria-label="New and recent puzzles"
              onClick={() => void loadAdmin()}
            >
              🆕
            </button>
          )}
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
        </div>
      </div>
      <p className="creator-help">
        Pick a color, then tap or drag. Tap the same color again to erase. Long
        press to fill.
      </p>
      <div className="editor-canvas-region">
        <div className="editor-frame">
          <div
            className="editor-grid"
            role="grid"
            aria-label="20 by 18 Art Breaker board editor"
            onPointerMove={moveStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onContextMenu={(event) => event.preventDefault()}
          >
            {cells.map((value, index) => (
              <button
                key={index}
                type="button"
                className="editor-cell"
                data-index={index}
                aria-label={`Row ${Math.floor(index / EDITOR_COLUMNS) + 1}, column ${(index % EDITOR_COLUMNS) + 1}, ${value ? PALETTE[value - 1]?.name : 'empty'}`}
                style={{
                  background: value ? PALETTE[value - 1]?.hex : '#1b1b1e',
                }}
                onPointerDown={(event) => beginStroke(index, event)}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    keyboardPaint(index);
                  }
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="editor-controls">
        <div className="palette-panel">
          <div className="panel-label">
            <span>COLOR: {PALETTE[selected - 1]?.name.toUpperCase()}</span>
            <span>{count} BRICKS</span>
          </div>
          <div className="palette">
            {EDITOR_PALETTE_ORDER.map((value) => (
              <button
                key={value}
                type="button"
                className="swatch"
                style={{ background: PALETTE[value - 1]?.hex }}
                aria-label={PALETTE[value - 1]?.name}
                aria-pressed={selected === value}
                onClick={() => setSelected(value)}
              />
            ))}
          </div>
        </div>
        <div className="editor-tools">
          <button
            className="tool-button"
            type="button"
            disabled={!undo.length}
            onClick={undoOnce}
          >
            UNDO
          </button>
          <button
            className="tool-button"
            type="button"
            disabled={!redo.length}
            onClick={redoOnce}
          >
            REDO
          </button>
          <button
            className="tool-button danger"
            type="button"
            disabled={!count}
            onClick={clear}
          >
            CLEAR
          </button>
        </div>
        <div
          className={`button-row editor-actions ${bootstrap.user.moderator ? 'moderator-actions' : ''}`}
        >
          <div className="editor-action-anchor">
            <ArcadeButton disabled={!count || busy} onClick={() => void save()}>
              {bootstrap.user.moderator ? (
                'SAVE'
              ) : (
                <>
                  <span className="save-label-long">SAVE DRAFT</span>
                  <span className="save-label-short">SAVE</span>
                </>
              )}
            </ArcadeButton>
            {notice && (
              <p
                className={cn('editor-toast', { error: noticeError })}
                role="status"
              >
                {notice}
              </p>
            )}
          </div>
          <ArcadeButton
            disabled={!count || busy}
            onClick={() => setPreview(true)}
          >
            PREVIEW
          </ArcadeButton>
          {bootstrap.user.moderator ? (
            <>
              <ArcadeButton
                tone="blue"
                disabled={!count || busy}
                onClick={() => openPublish('now')}
              >
                PUBLISH
              </ArcadeButton>
              <ArcadeButton
                tone="blue"
                disabled={!count || busy}
                onClick={() => openPublish('queue')}
              >
                QUEUE
              </ArcadeButton>
            </>
          ) : (
            <ArcadeButton
              tone="blue"
              disabled={!count || busy}
              onClick={() => openPublish('user')}
            >
              PUBLISH
            </ArcadeButton>
          )}
        </div>
      </div>
      {publishDialog && (
        <div className="modal-backdrop">
          <section
            className="publish-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-title"
          >
            <h2 id="publish-title">
              {publishDialog === 'queue'
                ? 'Queue board'
                : 'Publish your creation'}
            </h2>
            {publishError ? (
              <p className="publish-error" role="alert">
                {publishError}
              </p>
            ) : (
              <label
                className={cn('publish-name-field', {
                  invalid: Boolean(publishValidation),
                })}
              >
                <span>
                  {publishValidation === 'offensive'
                    ? 'OFFENSIVE CONTENT, PLS REMOVE'
                    : publishValidation === 'too-short'
                      ? 'NAME MUST BE AT LEAST 3 CHARS'
                      : publishValidation === 'too-long'
                        ? 'MAX TITLE LENGTH IS 22'
                        : 'BOARD NAME'}
                </span>
                <input
                  autoFocus
                  value={publishName}
                  maxLength={100}
                  placeholder="Custom Art Breaker"
                  aria-invalid={Boolean(publishValidation)}
                  onChange={(event) => {
                    const next = event.target.value;
                    setPublishName(next);
                    if (publishValidation)
                      setPublishValidation(boardNameIssue(next));
                  }}
                />
              </label>
            )}
            {(publishDialog === 'user' || publishDialog === 'now') &&
              !publishError && (
                <p className="publish-identity-note">
                  This will create a new post in r/{bootstrap.subredditName}{' '}
                  with your Reddit username
                </p>
              )}
            {publishDialog === 'queue' ? (
              <div className="button-row">
                <ArcadeButton
                  disabled={busy || publishComplete}
                  onClick={closePublish}
                >
                  CANCEL
                </ArcadeButton>
                <ArcadeButton
                  tone="blue"
                  disabled={busy || publishComplete || Boolean(publishError)}
                  onClick={() => void publish('front')}
                >
                  FRONT
                </ArcadeButton>
                <ArcadeButton
                  tone="blue"
                  disabled={busy || publishComplete || Boolean(publishError)}
                  onClick={() => void publish('back')}
                >
                  BACK
                </ArcadeButton>
              </div>
            ) : (
              <div className="button-row">
                <ArcadeButton
                  disabled={busy || publishComplete}
                  onClick={closePublish}
                >
                  CANCEL
                </ArcadeButton>
                <ArcadeButton
                  tone="blue"
                  disabled={busy || publishComplete || Boolean(publishError)}
                  onClick={() => void publish()}
                >
                  {publishComplete ? 'PUBLISHED!' : 'PUBLISH'}
                </ArcadeButton>
              </div>
            )}
          </section>
        </div>
      )}
      {preview && (
        <div className="modal-backdrop">
          <section className="preview-modal">
            <div className="dialog-header">
              <h2>Board preview</h2>
              <button
                className="back-button"
                type="button"
                onClick={() => setPreview(false)}
              >
                ×
              </button>
            </div>
            <BoardCanvas board={draftBoard()} label="Preview of your board" />
            <ArcadeButton tone="primary" onClick={playPreview}>
              PLAY THIS DRAFT
            </ArcadeButton>
          </section>
        </div>
      )}
    </section>
  );
};

const BoardList = ({
  data,
  deviceId,
  error,
  loading,
  onBack,
  onResume,
}: {
  data: MyBoards | null;
  deviceId: string;
  error: string;
  loading: boolean;
  onBack: () => void;
  onResume: (board: Board) => void;
}) => {
  const [page, setPage] = useState(0);
  const [deleted, setDeleted] = useState<Set<string>>(() => new Set());
  const [eraseTarget, setEraseTarget] = useState<Board | null>(null);
  const [eraseBusy, setEraseBusy] = useState(false);
  const [eraseError, setEraseError] = useState('');
  const boards = data
    ? [...data.drafts, ...data.queued, ...data.published].filter(
        (board) => !deleted.has(board.id)
      )
    : [];
  const pageSize = 4;
  const pages = Math.max(1, Math.ceil(boards.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = boards.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );
  const closeErase = () => {
    if (!eraseBusy) {
      setEraseTarget(null);
      setEraseError('');
    }
  };
  const erase = async () => {
    if (!eraseTarget) return;
    setEraseBusy(true);
    setEraseError('');
    try {
      await trpc.boards.deleteDraft.mutate({
        deviceId,
        boardId: eraseTarget.id,
      });
      setDeleted((current) => new Set([...current, eraseTarget.id]));
      setEraseTarget(null);
    } catch (error) {
      setEraseError(messageOf(error));
    } finally {
      setEraseBusy(false);
    }
  };
  return (
    <section className="screen list-screen my-boards-screen">
      <div className="screen-header">
        <button
          className="back-button"
          type="button"
          aria-label="Back"
          onClick={onBack}
        >
          ←
        </button>
        <h1>My boards</h1>
      </div>
      <div className="my-boards-content">
        {loading ? (
          <div
            className="screen-loading board-loading"
            role="status"
            aria-live="polite"
          >
            <BoardLoader label="Loading your boards…" />
          </div>
        ) : !data ? (
          <p className="notice">{error || 'My boards are unavailable.'}</p>
        ) : (
          <>
            {visible.length ? (
              <div className="my-board-list">
                {visible.map((board) => (
                  <BoardRow
                    key={board.id}
                    board={board}
                    action={
                      board.status === 'draft' ? (
                        <div className="board-row-actions">
                          <ArcadeButton
                            tone="danger"
                            onClick={() => setEraseTarget(board)}
                          >
                            ERASE
                          </ArcadeButton>
                          <ArcadeButton onClick={() => onResume(board)}>
                            EDIT
                          </ArcadeButton>
                        </div>
                      ) : board.status === 'published' && board.permalink ? (
                        <ArcadeButton
                          tone="blue"
                          onClick={() =>
                            navigateTo(redditUrl(board.permalink ?? ''))
                          }
                        >
                          PLAY
                        </ArcadeButton>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="notice">No boards yet.</p>
            )}
            {pages > 1 && (
              <div className="my-boards-pager">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  ← PREV
                </button>
                <strong>
                  {safePage + 1} / {pages}
                </strong>
                <button
                  type="button"
                  disabled={safePage + 1 >= pages}
                  onClick={() => setPage(safePage + 1)}
                >
                  NEXT →
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {eraseTarget && (
        <div className="modal-backdrop">
          <section
            className="erase-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="erase-title"
          >
            <h2 id="erase-title">Are you sure</h2>
            <p>This cannot be undone. This board will be lost forever.</p>
            {eraseError && (
              <p className="publish-error" role="alert">
                {eraseError}
              </p>
            )}
            <div className="button-row">
              <ArcadeButton disabled={eraseBusy} onClick={closeErase}>
                CANCEL
              </ArcadeButton>
              <ArcadeButton
                tone="danger"
                disabled={eraseBusy}
                onClick={() => void erase()}
              >
                ERASE
              </ArcadeButton>
            </div>
          </section>
        </div>
      )}
    </section>
  );
};

const BoardRow = ({ board, action }: { board: Board; action?: ReactNode }) => (
  <article className="board-row">
    <BoardCanvas board={board} label={board.title} />
    <div className="board-row-copy">
      <strong title={board.title}>{board.title}</strong>
      <small>
        {board.status.toUpperCase()} · Created by u/{board.creatorUsername}
      </small>
      {action}
    </div>
  </article>
);

const AdminView = ({
  data,
  deviceId,
  error,
  loading,
  onBack,
  onResume,
}: {
  data: AdminData | null;
  deviceId: string;
  error: string;
  loading: boolean;
  onBack: () => void;
  onResume: (board: Board) => void;
}) => {
  const [queuePage, setQueuePage] = useState(0);
  const [publishedPage, setPublishedPage] = useState(0);
  const [notice, setNotice] = useState('');
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState('');
  const pageSize = 4;
  const maxPages = 100;
  const queue = (
    data?.queue.filter((board) => !removed.has(board.id)) ?? []
  ).slice(0, pageSize * maxPages);
  const published = (data?.recent ?? []).slice(0, pageSize * maxPages);
  const queuePages = Math.max(1, Math.ceil(queue.length / pageSize));
  const publishedPages = Math.max(1, Math.ceil(published.length / pageSize));
  const safeQueuePage = Math.min(queuePage, queuePages - 1);
  const safePublishedPage = Math.min(publishedPage, publishedPages - 1);
  const visibleQueue = queue.slice(
    safeQueuePage * pageSize,
    safeQueuePage * pageSize + pageSize
  );
  const visiblePublished = published.slice(
    safePublishedPage * pageSize,
    safePublishedPage * pageSize + pageSize
  );
  const remove = async (board: Board) => {
    setBusyId(board.id);
    setNotice('');
    try {
      const editable = await trpc.admin.removeQueued.mutate({
        deviceId,
        boardId: board.id,
      });
      setRemoved((current) => new Set([...current, board.id]));
      onResume(editable);
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setBusyId('');
    }
  };
  const publish = async (board: Board) => {
    setBusyId(board.id);
    setNotice('');
    try {
      const published = await trpc.admin.publishQueued.mutate({
        deviceId,
        boardId: board.id,
      });
      if (published.permalink) navigateTo(redditUrl(published.permalink));
      else
        setNotice('The board was published, but its post link is unavailable.');
    } catch (error) {
      setNotice(messageOf(error));
    } finally {
      setBusyId('');
    }
  };
  return (
    <section className="screen list-screen admin-queue-screen">
      <div className="screen-header">
        <button className="back-button" type="button" onClick={onBack}>
          ←
        </button>
        <h1>Recent puzzles</h1>
      </div>
      <div className="admin-queue-content">
        {loading ? (
          <div
            className="screen-loading board-loading"
            role="status"
            aria-live="polite"
          >
            <BoardLoader label="Loading recent puzzles…" />
          </div>
        ) : !data ? (
          <p className="notice">{error || 'Recent puzzles are unavailable.'}</p>
        ) : (
          <div className="admin-columns">
            <section className="admin-column">
              <h2>Queue</h2>
              <div className="admin-column-list">
                {visibleQueue.map((board) => (
                  <BoardRow
                    key={board.id}
                    board={board}
                    action={
                      <div className="board-row-actions">
                        <ArcadeButton
                          tone="danger"
                          disabled={Boolean(busyId)}
                          onClick={() => void remove(board)}
                        >
                          REMOVE
                        </ArcadeButton>
                        <ArcadeButton
                          tone="blue"
                          disabled={Boolean(busyId)}
                          onClick={() => void publish(board)}
                        >
                          PUBLISH
                        </ArcadeButton>
                      </div>
                    }
                  />
                ))}
                {!visibleQueue.length && (
                  <p className="admin-empty">The queue is empty.</p>
                )}
              </div>
              {queuePages > 1 && (
                <div className="admin-column-pager">
                  <button
                    type="button"
                    disabled={safeQueuePage === 0}
                    onClick={() => setQueuePage(safeQueuePage - 1)}
                  >
                    ← PREVIOUS
                  </button>
                  <strong>
                    {safeQueuePage + 1} / {queuePages}
                  </strong>
                  <button
                    type="button"
                    disabled={safeQueuePage + 1 >= queuePages}
                    onClick={() => setQueuePage(safeQueuePage + 1)}
                  >
                    NEXT →
                  </button>
                </div>
              )}
            </section>
            <section className="admin-column">
              <h2>Recently published</h2>
              <div className="admin-column-list">
                {visiblePublished.map((board) => (
                  <BoardRow
                    key={board.id}
                    board={board}
                    action={
                      board.permalink ? (
                        <ArcadeButton
                          onClick={() =>
                            navigateTo(redditUrl(board.permalink ?? ''))
                          }
                        >
                          OPEN POST
                        </ArcadeButton>
                      ) : undefined
                    }
                  />
                ))}
                {!visiblePublished.length && (
                  <p className="admin-empty">Nothing published yet.</p>
                )}
              </div>
              {publishedPages > 1 && (
                <div className="admin-column-pager">
                  <button
                    type="button"
                    disabled={safePublishedPage === 0}
                    onClick={() => setPublishedPage(safePublishedPage - 1)}
                  >
                    ← PREVIOUS
                  </button>
                  <strong>
                    {safePublishedPage + 1} / {publishedPages}
                  </strong>
                  <button
                    type="button"
                    disabled={safePublishedPage + 1 >= publishedPages}
                    onClick={() => setPublishedPage(safePublishedPage + 1)}
                  >
                    NEXT →
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
        {notice && <p className="notice">{notice}</p>}
      </div>
    </section>
  );
};
