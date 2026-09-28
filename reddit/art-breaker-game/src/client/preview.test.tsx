import { afterEach, describe, expect, it, vi } from 'vitest';

let bootstrapQueryMock: ReturnType<typeof vi.fn>;

vi.mock('@devvit/web/client', () => ({
  exitExpandedMode: vi.fn(),
  getWebViewMode: vi.fn(() => 'inline'),
  requestExpandedMode: vi.fn(),
  showLoginPrompt: vi.fn(),
}));
vi.mock('./trpc', () => {
  bootstrapQueryMock = vi.fn(() => new Promise(() => undefined));
  return { trpc: { bootstrap: { query: bootstrapQueryMock } } };
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('Preview', () => {
  it('shows a loader instead of seed artwork while the post board is loading', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await import('./preview');
    await vi.waitFor(() => expect(bootstrapQueryMock).toHaveBeenCalled());

    expect(document.querySelector('[role="status"]')?.textContent).toContain('Loading board');
    expect(document.querySelectorAll('.board-loader i')).toHaveLength(4);
    expect(document.querySelector('canvas')).toBeNull();
    expect(document.body.textContent).not.toContain('Rainbow No. 1');
  });
});
