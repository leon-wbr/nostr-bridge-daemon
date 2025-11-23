export interface EndpointConfig {
  scheme: string;
  path: string;
  query: Record<string, string | string[]>;
}

export interface Consumer {
  start(onEvent: (event: any) => void): () => void;
}

export interface Producer {
  send(payload: any): Promise<void>;
}

export interface ComponentContext {
  logger: Console;
  // Shared resources available to components; kept loosely typed for the PoC.
  nostrClient?: any;
  scheduler?: any;
  keys?: Record<string, string | Uint8Array>;
  emailSender?: (
    message: { to: string | string[]; subject: string; body: string; from?: string },
    options?: Record<string, unknown>,
  ) => Promise<void>;
}

export interface Component {
  createConsumer?(endpoint: EndpointConfig, ctx: ComponentContext): Consumer;
  createProducer?(endpoint: EndpointConfig, ctx: ComponentContext): Producer;
}
