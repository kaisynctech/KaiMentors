create or replace function public.set_default_portal_risk_disclosure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.risk_disclosure_template_id is null then
    select id into new.risk_disclosure_template_id
    from public.risk_disclosure_templates
    where is_default and is_active
    limit 1;
  end if;
  if new.risk_disclosure_template_id is null then
    raise exception 'an active default risk disclosure is required';
  end if;
  return new;
end;
$$;

drop trigger if exists set_portal_default_risk_disclosure on public.portals;
create trigger set_portal_default_risk_disclosure
  before insert on public.portals
  for each row execute function public.set_default_portal_risk_disclosure();
