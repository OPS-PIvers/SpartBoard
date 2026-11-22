// True for youtube.com and youtube-nocookie.com (and their subdomains), the hosts whose embeds honor player params.
export const isYouTubeHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com')
  );
};
