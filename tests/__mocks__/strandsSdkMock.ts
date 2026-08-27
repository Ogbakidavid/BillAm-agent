/**
 * Strands SDK Mock for Jest Test Environment
 */
export function tool(config: {
  name: string;
  description?: string;
  inputSchema?: any;
  callback: (input: any, context?: any) => Promise<any> | any;
}) {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    callback: config.callback,
    invoke: async (input: any, context?: any) => {
      if (config.inputSchema) {
        config.inputSchema.parse(input);
      }
      return config.callback(input, context);
    },
  };
}
