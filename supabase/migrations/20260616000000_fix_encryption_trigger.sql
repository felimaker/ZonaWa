-- Fix the encryption trigger to avoid double encryption of keys starting with 'ww0E'
CREATE OR REPLACE FUNCTION public.encrypt_api_key_trigger()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (NEW.api_key <> OLD.api_key) THEN
    -- Evitar re-cifrar si ya empieza por los prefijos de cifrado ('hQ', 'y2h', 'ww0E')
    IF NEW.api_key NOT LIKE 'hQ%' AND NEW.api_key NOT LIKE 'y2h%' AND NEW.api_key NOT LIKE 'ww0E%' THEN
      NEW.api_key := encode(extensions.pgp_sym_encrypt(NEW.api_key, 'super-secret-vault-key-123'), 'base64');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-cifrar (descifrar un nivel) las claves que quedaron doblemente cifradas (comienzan con 'ww0E')
-- Para que queden con un solo nivel de cifrado.
-- Al hacer el update, el trigger se ejecutará pero no volverá a cifrar porque el valor descifrado coincidirá con la exclusión 'ww0E%'.
UPDATE public.ai_connections
SET api_key = extensions.pgp_sym_decrypt(decode(api_key, 'base64'), 'super-secret-vault-key-123')
WHERE api_key LIKE 'ww0E%';
