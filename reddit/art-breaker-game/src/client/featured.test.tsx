import { afterEach, expect, it, vi } from 'vitest';

let pageQueryMock: ReturnType<typeof vi.fn>;
let navigateMock: ReturnType<typeof vi.fn>;

vi.mock('@devvit/web/client', () => {
  navigateMock = vi.fn();
  return { navigateTo: navigateMock };
});
vi.mock('./board-canvas', () => ({ BoardCanvas: () => null }));
vi.mock('./trpc', () => {
  const boards = ['one', 'two', 'three', 'four', 'five'].map((id) => ({
    id,
    title: `Board ${id}`,
    creatorUsername: id,
    permalink: `/r/ArtBreakerBeta/comments/${id}`,
  }));
  pageQueryMock = vi.fn(async ({ page }: { page: number }) => ({
    boards: boards.slice(page * 4, page * 4 + 4),
    page,
    pages: 2,
  }));
  return { trpc: { featured: { page: { query: pageQueryMock } } } };
});

afterEach(() => { document.body.innerHTML = ''; });

it('shows a 2x2 featured grid with only pagination and board links', async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await import('./featured');
  await vi.waitFor(() => expect(document.querySelectorAll('.featured-board-grid .board-card')).toHaveLength(4));
  expect(document.body.textContent).toContain('Featured boards from our community');
  expect(document.body.textContent).not.toMatch(/\bPLAY\b|\bCREATE\b/);

  document.querySelector<HTMLButtonElement>('.featured-pager button:last-child')?.click();
  await vi.waitFor(() => expect(document.querySelectorAll('.featured-board-grid .board-card')).toHaveLength(1));
  expect(pageQueryMock).toHaveBeenCalledWith({ page: 1 });
  document.querySelector<HTMLButtonElement>('.featured-board-grid .board-card')?.click();
  expect(navigateMock).toHaveBeenCalledWith('https://reddit.com/r/ArtBreakerBeta/comments/five');
});
