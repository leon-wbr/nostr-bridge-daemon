type StatusIntent = {
  subject: string;
  body: string;
  content: string;
  tags: string[][];
};

export default function statusIntent() {
  return async (): Promise<StatusIntent> => {
    const now = new Date();
    const iso = now.toISOString();
    const content = `Status tick @ ${iso}`;
    const body = `Automated status ping generated at ${iso}.`;
    return {
      subject: 'Status',
      body,
      content,
      tags: [
        ['t', 'status'],
        ['generated-at', iso],
      ],
    };
  };
}
