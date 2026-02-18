import { TranslationService } from './translation.service.js';
import { messagesEn } from './messages.en.js';
import { messagesUk } from './messages.uk.js';

describe('TranslationService', () => {
  const service = new TranslationService();

  it('should return Ukrainian messages for "uk" locale', () => {
    const msgs = service.getMessages('uk');
    expect(msgs).toBe(messagesUk);
  });

  it('should return English messages for "en" locale', () => {
    const msgs = service.getMessages('en');
    expect(msgs).toBe(messagesEn);
  });

  it('should return default (Ukrainian) messages when locale is undefined', () => {
    const msgs = service.getMessages(undefined);
    expect(msgs).toBe(messagesUk);
  });

  it('should return default (Ukrainian) messages for unsupported locale', () => {
    const msgs = service.getMessages('xx');
    expect(msgs).toBe(messagesUk);
  });

  it('should return default messages when called with no arguments', () => {
    const msgs = service.getMessages();
    expect(msgs).toBe(messagesUk);
  });
});
