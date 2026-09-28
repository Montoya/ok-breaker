import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getDeviceId = (): string => {
  const key = 'art-breaker-device';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
};

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message.replace(/^\w+Error:\s*/, '') : 'Something went wrong.';

export const redditUrl = (permalink: string): string =>
  new URL(permalink, 'https://reddit.com').toString();
