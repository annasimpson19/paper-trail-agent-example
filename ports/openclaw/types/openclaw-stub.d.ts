// UNVERIFIED local stand-in for `openclaw/plugin-sdk/tool-plugin`, used only so `npx tsc -p ports/openclaw` can check
// this plugin's own logic on a machine without openclaw (which needs Node >= 24.16). It is NOT the real .d.ts:
// delete this file once openclaw is installed and let the package's own types take over.
declare module "openclaw/plugin-sdk/tool-plugin" {
  export interface ToolContext { signal?: AbortSignal; [key: string]: unknown }
  export interface ToolSpec<P = any, C = any> {
    name: string;
    label?: string;
    description: string;
    parameters: unknown;
    outputSchema?: unknown;
    execute(params: P, config: C, context: ToolContext): Promise<unknown>;
  }
  export interface ToolPluginSpec {
    id: string;
    name: string;
    description: string;
    configSchema: unknown;
    uiHints?: Record<string, { sensitive?: boolean }>;
    tools: (tool: <P, C>(spec: ToolSpec<P, C>) => ToolSpec<P, C>) => ToolSpec[];
  }
  export function defineToolPlugin(spec: ToolPluginSpec): ToolPluginSpec;
}
