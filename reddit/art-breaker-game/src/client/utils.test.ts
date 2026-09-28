import { describe, expect, it } from 'vitest';
import { redditUrl } from './utils';

describe('Reddit permalink navigation', () => {
  it('turns stored relative permalinks into absolute Reddit URLs', () => {
    expect(redditUrl('/r/ArtBreaker/comments/example/board/'))
      .toBe('https://reddit.com/r/ArtBreaker/comments/example/board/');
  });

  it('preserves absolute permalinks', () => {
    expect(redditUrl('https://www.reddit.com/r/ArtBreaker/comments/example/board/'))
      .toBe('https://www.reddit.com/r/ArtBreaker/comments/example/board/');
  });
});
