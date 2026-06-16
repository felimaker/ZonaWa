-- Migración: Cifrado de claves de API en la tabla ai_connections
-- Fecha: 2026-06-15

-- 1. Habilitar extensión pgcrypto en el esquema extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Trigger para cifrar automáticamente la clave de API antes de guardar
CREATE OR REPLACE FUNCTION public.encrypt_api_key_trigger()
RETURNS trigger AS $$
BEGIN
  -- Ciframos solo si es una nueva inserción o si la clave ha cambiado y no está ya cifrada
  IF TG_OP = 'INSERT' OR (NEW.api_key <> OLD.api_key) THEN
    -- Evitar re-cifrar si ya parece estar cifrada en PGP (empieza por el encabezado base64 de PGP 'hQ' o 'y2h')
    IF NEW.api_key NOT LIKE 'hQ%' AND NEW.api_key NOT LIKE 'y2h%' THEN
      NEW.api_key := encode(extensions.pgp_sym_encrypt(NEW.api_key, 'super-secret-vault-key-123'), 'base64');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger si existe y crearlo nuevamente
DROP TRIGGER IF EXISTS tr_encrypt_api_key ON public.ai_connections;
CREATE TRIGGER tr_encrypt_api_key
  BEFORE INSERT OR UPDATE ON public.ai_connections
  FOR EACH ROW EXECUTE FUNCTION public.encrypt_api_key_trigger();

-- 3. Cifrar claves existentes en la base de datos
UPDATE public.ai_connections
SET api_key = encode(extensions.pgp_sym_encrypt(api_key, 'super-secret-vault-key-123'), 'base64')
WHERE api_key NOT LIKE 'hQ%' AND api_key NOT LIKE 'y2h%';

-- 4. Crear Vista segura para descifrar automáticamente las conexiones
CREATE OR REPLACE VIEW public.decrypted_ai_connections 
WITH (security_invoker = true) AS
SELECT 
  id,
  user_id,
  provider,
  CASE 
    -- Descifrar solo si la consulta la hace el propietario o el rol de servicio (Edge Function)
    WHEN user_id = auth.uid() OR auth.role() = 'service_role' 
      THEN extensions.pgp_sym_decrypt(decode(api_key, 'base64'), 'super-secret-vault-key-123')
    ELSE '***'
  END AS api_key,
  nickname,
  is_active,
  created_at
FROM public.ai_connections;

-- Otorgar permisos sobre la vista
GRANT SELECT ON public.decrypted_ai_connections TO authenticated, service_role;
