import { useEffect, useMemo, useState } from 'react';
import type { LinkType } from '../../types/channel';
import { getChannelAvatarSources } from '../../utils/channelAvatar';

interface CandidateAvatarProps {
  link: string;
  avatarUrl?: string | null;
  linkType: LinkType;
  fallbackClassName?: string;
}

export function CandidateAvatar({ link, avatarUrl, linkType, fallbackClassName = 'text-xl' }: CandidateAvatarProps) {
  const avatarSources = useMemo(
    () => getChannelAvatarSources({ avatarUrl, link }),
    [avatarUrl, link],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
  }, [link, avatarUrl, avatarSources]);

  const currentSrc = avatarSources[sourceIndex];

  if (!currentSrc || failed) {
    return <span className={fallbackClassName}>{linkType === 'group' ? '👥' : '📢'}</span>;
  }

  return (
    <img
      src={currentSrc}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => {
        if (sourceIndex + 1 < avatarSources.length) {
          setSourceIndex((index) => index + 1);
        } else {
          setFailed(true);
        }
      }}
      className="h-full w-full object-cover"
    />
  );
}
