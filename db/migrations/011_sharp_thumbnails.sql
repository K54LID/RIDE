-- Photos looked soft everywhere: avatars, discover tiles, photo strips.
--
-- Cause was in lib/telegramStorage.ts, not here. On upload we kept
-- Telegram's *smallest* returned photo size (~90px on the long edge) as
-- thumb_ref, and every avatar / tile / strip cell requests ?thumb=1.
-- A 90px image upscaled into a 64px slot on a 3x display is visibly
-- blurry, which is what it was.
--
-- New uploads now store a >= 640px variant. Photos already uploaded
-- still point at the tiny one, and we cannot re-derive a better size
-- from Telegram without re-uploading the bytes. Clearing thumb_ref for
-- images makes /v1/media/:id?thumb=1 fall through to file_ref (the full
-- Telegram-compressed image, capped around 1280px), so existing photos
-- go sharp immediately.
--
-- Videos keep their thumb_ref: a video thumbnail is a genuine poster
-- frame, there is no full-size equivalent to fall back to, and falling
-- through would make every video row download the whole file.

UPDATE media
SET thumb_ref = NULL
WHERE kind = 'image'
  AND thumb_ref IS NOT NULL;
