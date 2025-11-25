type MentionIntent = {
  to?: string | string[];
  subject: string;
  body: string;
  content?: string;
  tags?: unknown[];
};

const getContent = (payload: unknown): string => {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object' && (payload as any).content) return String((payload as any).content);
  return JSON.stringify(payload, null, 2);
};

export default function mentionsToIntent() {
  return async (event: any): Promise<MentionIntent> => {
    const tags = Array.isArray(event?.tags) ? event.tags : [];
    const mentionTag = tags.find((tag: unknown) => Array.isArray(tag) && tag[0] === 'p');
    const target = Array.isArray(mentionTag) ? mentionTag[1] : null;
    const content = getContent(event);
    const subject = `Nostr mention${target ? ` for ${target}` : ''}`;
    const body = `You were mentioned in a Nostr note${target ? ` (${target})` : ''}:\n\n${content}`;

    return {
      to: event?.to,
      subject,
      body,
      content,
      tags,
    };
  };
}
