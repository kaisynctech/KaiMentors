alter type public.verification_status
  add value if not exists 'needs_more_information';
