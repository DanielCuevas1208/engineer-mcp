const originalEmit = process.emitWarning.bind(process) as (warning: string | Error, ...args: unknown[]) => void;

process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const message = typeof warning === "string" ? warning : warning.message;
  if (message.includes("SQLite is an experimental feature")) {
    return;
  }
  originalEmit(warning, ...args);
}) as typeof process.emitWarning;
