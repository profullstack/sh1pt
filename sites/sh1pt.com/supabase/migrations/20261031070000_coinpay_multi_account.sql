-- Permit one CoinPay identity to connect to multiple sh1pt accounts.
-- Keep each local account limited to one CoinPay identity.
alter table public.coinpay_identities drop constraint if exists coinpay_identities_pkey;
alter table public.coinpay_identities add constraint coinpay_identities_pkey primary key (coinpay_sub, user_id);
