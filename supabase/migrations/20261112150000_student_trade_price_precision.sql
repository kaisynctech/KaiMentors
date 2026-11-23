-- Forex signals need more than three decimal places. Existing gold prices stay valid.
alter table public.student_trades
  alter column entry_price type numeric,
  alter column exit_price type numeric,
  alter column stop_loss type numeric;
