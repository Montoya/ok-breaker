import { reddit } from '@devvit/web/server';
import { T3 } from '@devvit/shared-types/tid.js';
import { getBoards } from './store';

export const SHARE_IMAGE_URL = 'https://i.redd.it/ew9m25wzu5oh1.jpeg';

export type ShareImageSyncResult = {
  updated: number;
  failed: number;
};

export const syncPublishedPostShareImages =
  async (): Promise<ShareImageSyncResult> => {
    const postIds = [
      ...new Set(
        (await getBoards())
          .filter((board) => board.status === 'published' && board.postId)
          .map((board) => board.postId!)
      ),
    ];
    const results = await Promise.allSettled(
      postIds.map((postId) =>
        reddit.setPostStyles(T3(postId), { shareImageUrl: SHARE_IMAGE_URL })
      )
    );
    const failed = results.filter((result) => result.status === 'rejected');
    failed.forEach((result) =>
      console.warn(
        'Could not update an Art Breaker post share image.',
        result.reason
      )
    );
    return { updated: results.length - failed.length, failed: failed.length };
  };
