import Media from './Media';

/**
 * Primary profile photo if one exists, initial letter otherwise. The
 * letter path renders instantly; the photo path streams through the
 * authenticated media proxy.
 */
export default function Avatar({ name, mediaId, size = 48, radius = 14 }: {
  name: string;
  mediaId?: string | null;
  size?: number;
  radius?: number;
}) {
  if (mediaId) {
    return (
      <div className="avatar-img" style={{ width: size, height: size, borderRadius: radius }}>
        <Media id={mediaId} kind="image" thumb />
      </div>
    );
  }
  return (
    <div className="person-avatar"
         style={{ width: size, height: size, borderRadius: radius,
                  fontSize: size * 0.42 }}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}
