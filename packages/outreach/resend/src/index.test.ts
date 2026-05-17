import { smokeTest } from '@profullstack/sh1pt-core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import adapter from './index.js';

smokeTest(adapter, { idPrefix: 'outreach' });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('outreach-resend', () => {
  it('requires a Resend API key when connecting', async () => {
    await expect(adapter.connect({ secret: () => undefined, log: () => {} })).rejects.toThrow('RESEND_API_KEY');
  });

  it('keeps dry-run side-effect free', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');

    await expect(adapter.sendSequence({
      secret: () => 'resend-token',
      log: () => {},
      dryRun: true,
    }, [
      { email: 'a@example.com', name: 'A' },
      { email: 'b@example.com', name: 'B' },
    ], {
      from: 'Sh1pt <hello@example.com>',
      subjectTemplate: 'Hello {{name}}',
      bodyTemplate: 'Welcome {{company}}',
      rateLimitPerHour: 5,
    })).resolves.toEqual({ sent: 0, queued: 2 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends rendered emails through the Resend API', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_one' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_two' }),
      } as Response);

    await expect(adapter.sendSequence({
      secret: (key: string) => key === 'RESEND_API_KEY' ? 'resend-token' : undefined,
      log: () => {},
      dryRun: false,
    }, [
      { email: 'a@example.com', name: 'Ada', data: { company: 'Analytical Engines' } },
      { email: 'g@example.com', name: 'Grace', data: { company: 'COBOL Labs' } },
    ], {
      from: 'Sh1pt <hello@example.com>',
      replyTo: 'reply@example.com',
      subjectTemplate: 'Quick note for {{company}}',
      bodyTemplate: 'Hi {{name}}, ship {{company}} faster.',
      rateLimitPerHour: 10,
    })).resolves.toEqual({ sent: 2, queued: 0, ids: ['email_one', 'email_two'] });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer resend-token',
        'content-type': 'application/json',
      },
    });
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      from: 'Sh1pt <hello@example.com>',
      to: ['a@example.com'],
      subject: 'Quick note for Analytical Engines',
      text: 'Hi Ada, ship Analytical Engines faster.',
      reply_to: 'reply@example.com',
    });
  });

  it('surfaces Resend API errors with the recipient address', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ message: 'Domain is not verified' }),
    } as Response);

    await expect(adapter.sendSequence({
      secret: () => 'resend-token',
      log: () => {},
      dryRun: false,
    }, [
      { email: 'lead@example.com', name: 'Lead' },
    ], {
      from: 'Sh1pt <hello@example.com>',
      subjectTemplate: 'Hello {{name}}',
      bodyTemplate: 'Welcome',
    })).rejects.toThrow('lead@example.com: Domain is not verified');
  });

  it('refuses batches above the configured hourly rate', async () => {
    await expect(adapter.sendSequence({
      secret: () => 'resend-token',
      log: () => {},
      dryRun: false,
    }, [
      { email: 'a@example.com' },
      { email: 'b@example.com' },
    ], {
      from: 'Sh1pt <hello@example.com>',
      subjectTemplate: 'Hello',
      bodyTemplate: 'Welcome',
      rateLimitPerHour: 1,
    })).rejects.toThrow('split the sequence');
  });
});
