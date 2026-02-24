import { TranslationService } from '../i18n/index.js';
import {
  buildMainMenuKeyboard,
  buildSettingsKeyboard,
  buildLanguageKeyboard,
  buildTimezoneKeyboard,
  buildCheckStatusButton,
  buildViewHistoryButton,
} from './keyboard.builder.js';

describe('Keyboard Builders', () => {
  const translationService = new TranslationService();
  const msgsUk = translationService.getMessages('uk');
  const msgsEn = translationService.getMessages('en');

  describe('buildMainMenuKeyboard', () => {
    it('should create 2x2 reply keyboard (uk)', () => {
      const kb = buildMainMenuKeyboard(msgsUk);
      const markup = kb.reply_markup;
      expect(markup.keyboard).toHaveLength(2);
      expect(markup.keyboard[0]).toHaveLength(2);
      expect(markup.keyboard[1]).toHaveLength(2);
      expect(markup.resize_keyboard).toBe(true);
    });

    it('should contain locale-aware button text (uk)', () => {
      const kb = buildMainMenuKeyboard(msgsUk);
      const flat = kb.reply_markup.keyboard.flat();
      expect(flat).toContain('📊 Статус');
      expect(flat).toContain('📱 Пристрої');
      expect(flat).toContain('⚙️ Налаштування');
      expect(flat).toContain('❓ Довідка');
    });

    it('should contain locale-aware button text (en)', () => {
      const kb = buildMainMenuKeyboard(msgsEn);
      const flat = kb.reply_markup.keyboard.flat();
      expect(flat).toContain('📊 Status');
      expect(flat).toContain('📱 My Devices');
      expect(flat).toContain('⚙️ Settings');
      expect(flat).toContain('❓ Help');
    });
  });

  describe('buildSettingsKeyboard', () => {
    it('should have 2 inline buttons', () => {
      const kb = buildSettingsKeyboard(msgsUk);
      const buttons = kb.reply_markup.inline_keyboard;
      expect(buttons).toHaveLength(2);
    });

    it('should use correct callback data', () => {
      const kb = buildSettingsKeyboard(msgsEn);
      const buttons = kb.reply_markup.inline_keyboard.flat();
      expect(buttons[0]).toEqual(
        expect.objectContaining({ callback_data: 'settings:language' }),
      );
      expect(buttons[1]).toEqual(
        expect.objectContaining({ callback_data: 'settings:timezone' }),
      );
    });
  });

  describe('buildLanguageKeyboard', () => {
    it('should have 2 language options in one row', () => {
      const kb = buildLanguageKeyboard();
      const buttons = kb.reply_markup.inline_keyboard;
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveLength(2);
    });

    it('should use lang: callback data prefix', () => {
      const kb = buildLanguageKeyboard();
      const buttons = kb.reply_markup.inline_keyboard.flat();
      expect(buttons[0]).toEqual(
        expect.objectContaining({ callback_data: 'lang:uk' }),
      );
      expect(buttons[1]).toEqual(
        expect.objectContaining({ callback_data: 'lang:en' }),
      );
    });
  });

  describe('buildTimezoneKeyboard', () => {
    it('should have 4 timezone options in 2 rows', () => {
      const kb = buildTimezoneKeyboard(msgsUk);
      const buttons = kb.reply_markup.inline_keyboard;
      expect(buttons).toHaveLength(2);
      expect(buttons[0]).toHaveLength(2);
      expect(buttons[1]).toHaveLength(2);
    });

    it('should use tz: callback data prefix', () => {
      const kb = buildTimezoneKeyboard(msgsUk);
      const buttons = kb.reply_markup.inline_keyboard.flat();
      const cbData = buttons.map(
        (b) => (b as { callback_data: string }).callback_data,
      );
      expect(cbData).toContain('tz:Europe/Kyiv');
      expect(cbData).toContain('tz:Europe/London');
      expect(cbData).toContain('tz:Europe/Warsaw');
      expect(cbData).toContain('tz:US/Eastern');
    });
  });

  describe('buildCheckStatusButton', () => {
    it('should have single button with check_status callback', () => {
      const kb = buildCheckStatusButton(msgsUk);
      const buttons = kb.reply_markup.inline_keyboard;
      expect(buttons).toHaveLength(1);
      expect(buttons[0][0]).toEqual(
        expect.objectContaining({ callback_data: 'check_status' }),
      );
    });
  });

  describe('buildViewHistoryButton', () => {
    it('should have single button with view_history callback', () => {
      const kb = buildViewHistoryButton(msgsEn);
      const buttons = kb.reply_markup.inline_keyboard;
      expect(buttons).toHaveLength(1);
      expect(buttons[0][0]).toEqual(
        expect.objectContaining({ callback_data: 'view_history' }),
      );
    });
  });

  describe('callback data size', () => {
    it('should keep all callback data under 64 bytes', () => {
      const allCallbackData = [
        'check_status',
        'view_history',
        'settings:language',
        'settings:timezone',
        'lang:uk',
        'lang:en',
        'tz:Europe/Kyiv',
        'tz:Europe/London',
        'tz:Europe/Warsaw',
        'tz:US/Eastern',
      ];
      for (const data of allCallbackData) {
        expect(Buffer.byteLength(data, 'utf8')).toBeLessThan(64);
      }
    });
  });
});
