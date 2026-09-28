import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exitExpandedMode, getWebViewMode, showLoginPrompt } = vi.hoisted(() => ({
  exitExpandedMode: vi.fn(),
  getWebViewMode: vi.fn(),
  showLoginPrompt: vi.fn(),
}));

vi.mock('@devvit/web/client', () => ({
  exitExpandedMode,
  getWebViewMode,
  showLoginPrompt,
}));

import { startRedditLogin } from './login';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startRedditLogin', () => {
  it('requests login before closing expanded mode', () => {
    getWebViewMode.mockReturnValue('expanded');
    const event = new MouseEvent('click');

    startRedditLogin(event);

    expect(showLoginPrompt).toHaveBeenCalledOnce();
    expect(exitExpandedMode).toHaveBeenCalledWith(event);
    expect(showLoginPrompt.mock.invocationCallOrder[0]).toBeLessThan(
      exitExpandedMode.mock.invocationCallOrder[0]!
    );
  });

  it('keeps the inline view open', () => {
    getWebViewMode.mockReturnValue('inline');

    startRedditLogin(new MouseEvent('click'));

    expect(showLoginPrompt).toHaveBeenCalledOnce();
    expect(exitExpandedMode).not.toHaveBeenCalled();
  });
});
