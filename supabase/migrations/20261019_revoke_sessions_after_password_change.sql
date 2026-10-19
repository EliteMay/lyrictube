-- Applied to LyricTube production on 2026-10-19.
-- Does not modify existing account/session rows during migration.
-- Subsequent password changes invalidate previously issued sessions.
CREATE OR REPLACE FUNCTION public.lyrictube_set_password(p_account_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF char_length(coalesce(p_password, '')) < 8 OR char_length(p_password) > 128 THEN
    RAISE EXCEPTION 'invalid password length';
  END IF;

  UPDATE public.lyrictube_accounts
  SET password_hash = crypt(p_password, gen_salt('bf', 10)),
      updated_at = now()
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  DELETE FROM public.lyrictube_sessions WHERE account_id = p_account_id;
END;
$function$;
