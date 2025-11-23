type StatusIntent = {
  subject: string;
  body: string;
  content: string;
  tags: string[][];
};

export default function hourlyStatusIntent() {
  return async (): Promise<StatusIntent> => {
    const now = new Date();
    const iso = now.toISOString();
    const content = `Hourly status tick @ ${iso}`;
    const body = `Automated status ping generated at ${iso}.`;
    return {
      subject: 'Hourly Status',
      body,
      content,
      tags: [
        ['t', 'status'],
        ['generated-at', iso],
      ],
    };
  };
}
