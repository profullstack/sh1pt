import { smokeTest } from '@sh1pt/core/testing';
import adapter from './index.js';

// worldremit is a payouts adapter, not a checkout provider — supports[] is
// intentionally empty (the interface's supports field enumerates buyer-side
// currencies/methods). requireSupports skipped.
smokeTest(adapter, { idPrefix: 'payment', requireSupports: false });
