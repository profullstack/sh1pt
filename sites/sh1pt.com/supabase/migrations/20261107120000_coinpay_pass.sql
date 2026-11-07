-- Profullstack Pass (https://coinpayportal.com/pass): a CoinPay user who
-- deposited $99 into their own CoinPay wallet gets a free month of sh1pt Pro
-- on every Profullstack property. CoinPay reports it only in the userinfo
-- `pass` claim at sign-in, so the callback stores its end here (service role
-- only; the profile lockdown keeps users from writing it). Pro is
-- prepaid OR greatest(pro_until, coinpay_pass_until) > now() (lib/plan.ts).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coinpay_pass_until TIMESTAMPTZ;
