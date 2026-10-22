-- Phase 2 of the password boundary fix.
-- Applies only to NEW password hashes. Do not reject existing long passwords on login.
-- Reviewed against production pg_get_functiondef on 2026-10-22.
-- Deploy in a controlled release, verify existing credentials before/after, do not auto-apply from CI.
BEGIN;
CREATE OR REPLACE FUNCTION public.lyrictube_create_account(p_username text, p_display_name text, p_password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  new_id uuid;
begin
  IF char_length(coalesce(p_password, '')) < 8
     OR char_length(p_password) > 128
     OR octet_length(convert_to(coalesce(p_password,''), 'UTF8')) > 72 THEN
    RAISE EXCEPTION 'invalid password length';
  END IF;
  insert into public.lyrictube_accounts(username, display_name, password_hash, is_admin)
  values (trim(p_username), coalesce(nullif(trim(p_display_name), ''), trim(p_username)), crypt(p_password, gen_salt('bf', 10)), false)
  returning id into new_id;
  return new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lyrictube_register_account(p_username text, p_display_name text, p_password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_username text := trim(coalesce(p_username, ''));
  v_display_name text := trim(coalesce(p_display_name, ''));
  v_password text := coalesce(p_password, '');
  new_id uuid;
begin
  if v_username !~ '^[A-Za-z0-9_.-]{3,24}$' then
    raise exception 'invalid username';
  end if;
  if char_length(v_display_name) > 40 then
    raise exception 'display name too long';
  end if;
  if char_length(v_password) < 8 or char_length(v_password) > 128 or octet_length(convert_to(v_password, 'UTF8')) > 72 then
    raise exception 'invalid password length';
  end if;

  insert into public.lyrictube_accounts(username, display_name, password_hash, is_admin)
  values (
    v_username,
    coalesce(nullif(v_display_name, ''), v_username),
    crypt(v_password, gen_salt('bf', 10)),
    false
  )
  returning id into new_id;

  insert into public.lyrictube_account_state(account_id, library_version, settings, updated_at)
  values (new_id, 3, '{}'::jsonb, now());

  return new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lyrictube_set_password(p_account_id uuid, p_password text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF char_length(coalesce(p_password, '')) < 8 OR char_length(p_password) > 128 OR octet_length(convert_to(coalesce(p_password,''), 'UTF8')) > 72 THEN
    RAISE EXCEPTION 'invalid password length';
  END IF;

  UPDATE public.lyrictube_accounts
  SET password_hash = crypt(p_password, gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  -- Password rotation invalidates every previously issued device token.
  DELETE FROM public.lyrictube_sessions WHERE account_id = p_account_id;
END;
$function$;

-- Explicitly maintain the existing private RPC boundary.
REVOKE ALL ON FUNCTION public.lyrictube_create_account(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyrictube_register_account(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lyrictube_set_password(uuid,text) FROM PUBLIC, anon, authenticated;
COMMIT;
