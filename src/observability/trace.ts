export interface TracePort {
  startSpan(
    name: string,
    attributes?: Readonly<Record<string, string | number | boolean>>,
  ): TraceSpan;
}

export interface TraceSpan {
  end(): void;
}

export const noopTracePort: TracePort = {
  startSpan() {
    return {
      end() {
        // Trace real está fora do escopo; este stub documenta o ponto de extensão.
      },
    };
  },
};
