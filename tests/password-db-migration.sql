-- Isolated CI database only. Never point this script at production.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE TABLE public.lyrictube_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  updated_at timestamptz
);
CREATE TABLE public.lyrictube_account_state (
  account_id uuid PRIMARY KEY REFERENCES public.lyrictube_accounts(id),
  library_version integer NOT NULL,
  settings jsonb NOT NULL,
  updated_at timestamptz
);
CREATE TABLE public.lyrictube_sessions (
  account_id uuid REFERENCES public.lyrictube_accounts(id),
  token_hash text,
  expires_at timestamptz
);
\i supabase/migrations/20261022_password_utf8_boundary.sql
DO $$
DECLARE
  account_id uuid;
  original_hash text;
BEGIN
  account_id := public.lyrictube_register_account('ci_user', 'CI', '12345678');
  IF account_id IS NULL THEN RAISE EXCEPTION 'register failed'; END IF;

  BEGIN
    PERFORM public.lyrictube_register_account('ci_too_long', '', repeat('a', 73));
    RAISE EXCEPTION 'register accepted 73 bytes';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid password length' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.lyrictube_register_account('ci_unicode', '', repeat('あ', 25));
    RAISE EXCEPTION 'register accepted 75-byte UTF-8';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid password length' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.lyrictube_create_account('ci_admin_long', '', repeat('x', 73));
    RAISE EXCEPTION 'admin create accepted 73 bytes';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid password length' THEN RAISE; END IF;
  END;

  SELECT password_hash INTO original_hash FROM public.lyrictube_accounts WHERE id = account_id;
  BEGIN
    PERFORM public.lyrictube_set_password(account_id, repeat('あ', 25));
    RAISE EXCEPTION 'set password accepted 75 bytes';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid password length' THEN RAISE; END IF;
  END;
  IF (SELECT password_hash FROM public.lyrictube_accounts WHERE id = account_id) IS DISTINCT FROM original_hash THEN
    RAISE EXCEPTION 'rejected password changed the hash';
  END IF;

  PERFORM public.lyrictube_set_password(account_id, repeat('b', 72));
  IF (SELECT password_hash = extensions.crypt(repeat('b', 72), password_hash) FROM public.lyrictube_accounts WHERE id = account_id) IS NOT TRUE THEN
    RAISE EXCEPTION '72-byte password was not persisted correctly';
  END IF;
END $$;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.lyrictube_set_password(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.lyrictube_set_password(uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.lyrictube_register_account(text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.lyrictube_create_account(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'privileged RPC leaked to client roles';
  END IF;
END $$;
