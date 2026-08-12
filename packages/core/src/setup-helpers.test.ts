import { describe, expect, it, vi } from 'vitest';
import { tokenSetup } from './setup-helpers.js';

describe('tokenSetup', () => {
  it('collects required config fields when reusing an existing token', async () => {
    const prompt = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce('-1001234567890');
    const setup = tokenSetup<{ chatId: string }>({
      secretKey: 'TELEGRAM_BOT_TOKEN',
      label: 'Telegram',
      steps: [],
      fields: [
        { key: 'chatId', message: 'Chat ID:', required: true },
      ],
    });

    const result = await setup({
      secret: () => 'existing-token',
      setSecret: vi.fn(),
      prompt,
      open: vi.fn(),
      log: vi.fn(),
      run: vi.fn(),
      platform: process.platform,
      env: process.env,
    });

    expect(result).toEqual({ ok: true, config: { chatId: '-1001234567890' } });
    expect(prompt).toHaveBeenNthCalledWith(2, {
      type: 'text',
      message: 'Chat ID:',
    });
  });
});
