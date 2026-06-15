alter table public.portals
  add column welcome_message text not null
    default 'Welcome to our private trading community.',
  add column whatsapp_number text,
  add column telegram_url text,
  add column instagram_url text,
  add column broker_cta_label text not null default 'Open broker account';

alter table public.portals
  add constraint portals_welcome_message_length
    check (char_length(welcome_message) between 1 and 600),
  add constraint portals_whatsapp_number_length
    check (whatsapp_number is null or char_length(whatsapp_number) <= 32),
  add constraint portals_telegram_url_length
    check (telegram_url is null or char_length(telegram_url) <= 500),
  add constraint portals_instagram_url_length
    check (instagram_url is null or char_length(instagram_url) <= 500),
  add constraint portals_broker_cta_label_length
    check (char_length(broker_cta_label) between 1 and 80);
