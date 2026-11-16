-- Test network only: a withdrawal can be paid to the Mutinynet faucet,
-- standing in for a hospital wallet. The app refuses it on mainnet.
alter table withdrawals drop constraint withdrawals_method_check;
alter table withdrawals add constraint withdrawals_method_check
  check (method in ('lightning', 'bank', 'test_faucet'));
