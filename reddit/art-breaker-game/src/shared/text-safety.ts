const blockedFragments = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'nigger',
  'faggot',
  'retard',
];

const normalizeText = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[013457@$]/g, (character) => ({
      '0': 'o',
      '1': 'i',
      '3': 'e',
      '4': 'a',
      '5': 's',
      '7': 't',
      '@': 'a',
      '$': 's',
    })[character] ?? character)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const passesTextSafety = (text: string): boolean => {
  const normalized = normalizeText(text);
  const compact = normalized.replace(/\s/g, '');
  return !blockedFragments.some(
    (blocked) => normalized.split(' ').includes(blocked) || compact.includes(blocked)
  );
};

export const MAX_BOARD_NAME_LENGTH = 22;

const graphemeSegmenter = new Intl.Segmenter('en-US', { granularity: 'grapheme' });

export const unicodeLength = (value: string): number =>
  Array.from(graphemeSegmenter.segment(value)).length;

export type BoardNameIssue = 'offensive' | 'too-short' | 'too-long' | null;

export const boardNameIssue = (value: string): BoardNameIssue => {
  const name = value.trim();
  if (!name) return null;
  if (!passesTextSafety(name)) return 'offensive';
  if (unicodeLength(name) < 3) return 'too-short';
  if (unicodeLength(name) > MAX_BOARD_NAME_LENGTH) return 'too-long';
  return null;
};
