import { describe, expect, it } from 'vitest';
import { scoreCommentParentId } from './trpc';

describe('score comments', () => {
  it('targets the board sticky comment', () => {
    expect(scoreCommentParentId({ commentId: 't1_sticky' })).toBe('t1_sticky');
  });

  it('does not fall back to a top-level post comment', () => {
    expect(() => scoreCommentParentId({})).toThrow(
      'The score thread is unavailable.'
    );
  });
});
