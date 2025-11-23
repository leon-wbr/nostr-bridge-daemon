export type FilterFn = (event: any) => boolean;

export function kind(...kinds: number[]): FilterFn {
  return (event) => kinds.includes(event?.kind);
}

export function tag(key: string) {
  return {
    exists(): FilterFn {
      return (event) =>
        Array.isArray(event?.tags) && event.tags.some((entry: unknown) => Array.isArray(entry) && entry[0] === key);
    },
    equals(value: string): FilterFn {
      return (event) =>
        Array.isArray(event?.tags) &&
        event.tags.some((entry: unknown) => Array.isArray(entry) && entry[0] === key && entry[1] === value);
    },
  };
}

export interface RouteDefinition {
  from: string;
  filters: FilterFn[];
  processors: Array<(payload: any) => Promise<any> | any>;
  to: string[];
}

export type RouteBuilder = RouteDefinition & {
  filter(fn: FilterFn): RouteBuilder;
  via(processor: (payload: any) => Promise<any> | any): RouteBuilder;
  to(targetUri: string): RouteBuilder;
  build(): RouteDefinition;
};

export function from(sourceUri: string): RouteBuilder {
  const def: RouteDefinition = {
    from: sourceUri,
    filters: [],
    processors: [],
    to: [],
  };

  const builder = Object.assign(def, {
    filter(fn: FilterFn) {
      def.filters.push(fn);
      return builder;
    },
    via(processor: (payload: any) => Promise<any> | any) {
      def.processors.push(processor);
      return builder;
    },
    to(targetUri: string) {
      def.to.push(targetUri);
      return builder;
    },
    build() {
      return def;
    },
  });

  return builder;
}
