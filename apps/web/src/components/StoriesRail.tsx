import { useRef } from 'react';
import type { StoryAuthor } from '../lib/api';
import { tg } from '../lib/tg';
import { useT } from '../i18n';
import { useMediaUpload } from '../lib/useMediaUpload';
import { apiFetch } from '../lib/api';
import Avatar from './Avatar';

/**
 * The rail above the feed. First tile adds a story (or opens your own
 * if you have one live — long-press the ring to add another). Rings
 * carry state: gradient for unseen, hairline for seen.
 */
export default function StoriesRail({
  authors, meId, meName, meAvatar, onOpen, onPosted,
}: {
  authors: StoryAuthor[];
  meId: string;
  meName: string;
  /** Your own primary photo. The "Your story" tile used to pass no
   *  media at all, so your own face was an initial letter on your own
   *  feed until you happened to post a story. */
  meAvatar: string | null;
  onOpen: (index: number) => void;
  onPosted: () => void;
}) {
  const t = useT();
  const media = useMediaUpload(1);
  const input = useRef<HTMLInputElement>(null);
  const mine = authors.findIndex((a) => a.author_id === meId);

  const pick = () => { tg.tap('light'); input.current?.click(); };

  const onFile = async (files: FileList | null) => {
    await media.add(files);
  };

  // Publish as soon as the upload lands.
  if (media.mediaIds.length > 0 && !media.uploading) {
    const id = media.mediaIds[0]!;
    media.reset();
    void apiFetch('/v1/stories', { method: 'POST', body: JSON.stringify({ media_id: id }) })
      .then(() => { tg.notify('success'); onPosted(); })
      .catch(() => tg.notify('error'));
  }

  return (
    <div className="rail">
      <input ref={input} type="file" accept="image/*,video/*" hidden
             onChange={(e) => { void onFile(e.target.files); e.target.value = ''; }} />

      {mine === -1 ? (
        <button className="rail-item" onClick={pick}>
          <span className="rail-ring add">
            <Avatar name={meName} mediaId={meAvatar} size={56} radius={28} />
            <span className="rail-plus">+</span>
          </span>
          <span className="rail-name">{t('story.your')}</span>
        </button>
      ) : (
        <button className="rail-item" onClick={() => onOpen(mine)}>
          <span className={`rail-ring ${authors[mine]!.unseen_count > 0 ? 'unseen' : 'seen'}`}>
            <Avatar name={meName} mediaId={authors[mine]!.avatar_media_id ?? meAvatar} size={56} radius={28} />
            <span className="rail-plus" onClick={(e) => { e.stopPropagation(); pick(); }}>+</span>
          </span>
          <span className="rail-name">{t('story.your')}</span>
        </button>
      )}

      {media.uploading ? (
        <div className="rail-item">
          <span className="rail-ring add"><span className="rail-upl num">{media.progress}%</span></span>
          <span className="rail-name">{t('compose.uploading')}</span>
        </div>
      ) : null}

      {authors.map((a, i) => (
        a.author_id === meId ? null : (
          <button key={a.author_id} className="rail-item"
                  onClick={() => { tg.tap('light'); onOpen(i); }}>
            <span className={`rail-ring ${a.unseen_count > 0 ? 'unseen' : 'seen'}`}>
              <Avatar name={a.display_name} mediaId={a.avatar_media_id} size={56} radius={28} />
            </span>
            <span className="rail-name">{a.display_name.split(' ')[0]}</span>
          </button>
        )
      ))}
    </div>
  );
}
