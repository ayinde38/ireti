-- Test network only: a withdrawal can be paid to a stand-in hospital wallet
-- (a sub-wallet the tester controls). The app refuses it on mainnet.
alter table withdrawals drop constraint withdrawals_method_check;
alter table withdrawals add constraint withdrawals_method_check
  check (method in ('lightning', 'bank', 'test_wallet'));
