import { contractTestCaptcha } from '@sh1pt/core/testing';
import captcha from './index.js';

contractTestCaptcha(captcha, {
  sampleConfig: {},
  requiredSecrets: ['TWOCAPTCHA_API_KEY'],
});
