import { escapeMarkdownV2, boldMd, codeMd } from './escape-markdown.js';

describe('escapeMarkdownV2', () => {
  it('should escape all MarkdownV2 special characters', () => {
    const special = '_*[]()~`>#+-=|{}.!\\';
    const result = escapeMarkdownV2(special);
    expect(result).toBe(
      '\\_\\*\\[\\]\\(\\)\\~\\`\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!\\\\',
    );
  });

  it('should leave regular text unchanged', () => {
    expect(escapeMarkdownV2('Hello World')).toBe('Hello World');
  });

  it('should escape dots and exclamation marks in sentences', () => {
    expect(escapeMarkdownV2('Hello!')).toBe('Hello\\!');
    expect(escapeMarkdownV2('End.')).toBe('End\\.');
  });

  it('should escape hyphens in MAC addresses', () => {
    expect(escapeMarkdownV2('AA:BB:CC:DD:EE:FF')).toBe('AA:BB:CC:DD:EE:FF');
    expect(escapeMarkdownV2('AA-BB-CC')).toBe('AA\\-BB\\-CC');
  });

  it('should handle empty string', () => {
    expect(escapeMarkdownV2('')).toBe('');
  });
});

describe('boldMd', () => {
  it('should wrap text in asterisks', () => {
    expect(boldMd('hello')).toBe('*hello*');
  });

  it('should work with already-escaped text', () => {
    expect(boldMd(escapeMarkdownV2('test.value'))).toBe('*test\\.value*');
  });
});

describe('codeMd', () => {
  it('should wrap text in backticks', () => {
    expect(codeMd('AA:BB:CC')).toBe('`AA:BB:CC`');
  });

  it('should escape backticks inside code', () => {
    expect(codeMd('val`ue')).toBe('`val\\`ue`');
  });

  it('should escape backslashes inside code', () => {
    expect(codeMd('path\\to')).toBe('`path\\\\to`');
  });
});
