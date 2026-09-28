import {
  exitExpandedMode,
  getWebViewMode,
  showLoginPrompt,
} from '@devvit/web/client';

export const startRedditLogin = (event: MouseEvent): void => {
  showLoginPrompt();
  if (getWebViewMode() === 'expanded') exitExpandedMode(event);
};
