INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  false,
  16777216,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp',
    'audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/opus',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 16777216,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "staff select whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "staff upload whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "staff delete whatsapp media" ON storage.objects;

CREATE POLICY "staff select whatsapp media" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'whatsapp-media' AND private.is_staff(auth.uid()));

CREATE POLICY "staff upload whatsapp media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'whatsapp-media' AND private.is_staff(auth.uid()));

CREATE POLICY "staff delete whatsapp media" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'whatsapp-media' AND private.is_staff(auth.uid()));
