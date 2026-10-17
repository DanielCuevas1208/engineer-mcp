export type ReferenceRecord = {
  id: string;
  title: string;
  source: string;
  edition?: string;
  section?: string;
  url?: string;
  note?: string;
};

export type MethodRecord = {
  id: string;
  name: string;
  formula: string;
  notes: string;
  referenceIds: string[];
};

export type Quantity = {
  key: string;
  label: string;
  value: number;
  unit: string;
  description: string;
};

export type Computation = {
  method: MethodRecord;
  inputs: Record<string, unknown>;
  quantities: Quantity[];
  safetyFactor?: Quantity;
  rows?: Record<string, unknown>[];
  referenceIds: string[];
  warnings: string[];
};

export type ToolResult = {
  ok: true;
  tool: string;
  method: MethodRecord;
  inputs: Record<string, unknown>;
  quantities: Quantity[];
  safetyFactor?: Quantity;
  references: ReferenceRecord[];
  warnings: string[];
  rows?: Record<string, unknown>[];
  meta?: Record<string, string | number>;
};

export type ToolFailure = {
  ok: false;
  tool: string;
  error: string;
  input: Record<string, unknown>;
};

export type ToolResponse = ToolResult | ToolFailure;

export type SectionShape =
  | "rectangle"
  | "circle"
  | "hollow_circle"
  | "i_beam"
  | "box";
