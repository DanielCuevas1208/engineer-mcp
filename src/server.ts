import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppContext } from "./context.js";
import { createHandlers, type Handler } from "./handlers.js";
import {
  beamSchema,
  bearingSchema,
  boltSchema,
  fatigueSchema,
  materialSchema,
  sectionPropsSchema,
  shaftSchema,
  springSchema,
  stressSchema,
  unitConvertSchema,
} from "./schemas.js";
import type { ToolResult } from "./types.js";
import { SERVER_NAME, VERSION } from "./version.js";

type ToolDef = {
  description: string;
  schema: z.ZodTypeAny;
};

const TOOL_SCHEMAS: Record<string, ToolDef> = {
  beam_bending: {
    description:
      "Bending stress, deflection, and safety factor for a simply supported or cantilever beam with a point or uniform load.",
    schema: beamSchema,
  },
  section_properties: {
    description: "Area, moments of inertia, section moduli, and radius of gyration for standard cross-sections.",
    schema: sectionPropsSchema,
  },
  bolt_strength: {
    description: "Tensile stress area, proof strength, recommended preload, and safety factor for metric bolts.",
    schema: boltSchema,
  },
  spring_design: {
    description:
      "Helical compression spring geometry, spring rate, Wahl-corrected shear stress, and safety factor for round wire.",
    schema: springSchema,
  },
  shaft_analysis: {
    description: "Torsion stress, angle of twist, and first lateral critical speed for solid or hollow shafts.",
    schema: shaftSchema,
  },
  bearing_life: {
    description: "ISO 281 basic rating life L10 for ball and roller bearings, in revolutions and hours.",
    schema: bearingSchema,
  },
  fatigue_analysis: {
    description:
      "Fatigue safety factor for a cyclic stress using the Goodman, Gerber, and Soderberg criteria with Shigley endurance-limit factors.",
    schema: fatigueSchema,
  },
  von_mises: {
    description: "von Mises equivalent stress, maximum shear stress, and yield safety factor for a stress state.",
    schema: stressSchema,
  },
  unit_convert: {
    description: "Convert a value between compatible units. Rejects mismatched dimensions and quantity categories.",
    schema: unitConvertSchema,
  },
  material_lookup: {
    description: "Look up mechanical properties for common engineering materials from the curated database.",
    schema: materialSchema,
  },
};

function asStructuredContent(value: ToolResult): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

export function buildServer(ctx: AppContext): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: VERSION });
  const handlers: Record<string, Handler> = createHandlers(ctx);

  for (const [name, def] of Object.entries(TOOL_SCHEMAS)) {
    const handler: Handler = handlers[name] as Handler;
    server.registerTool(name, { description: def.description, inputSchema: def.schema }, async (input) => {
      const response = handler(input as Record<string, unknown>);
      if (!response.ok) {
        throw new Error(response.error);
      }
      const result: ToolResult = response;
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: asStructuredContent(result),
      };
    });
  }

  return server;
}

export function listTools(): string[] {
  return Object.keys(TOOL_SCHEMAS);
}
