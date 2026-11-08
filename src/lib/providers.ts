// The volatile inputs the domain never touches: ids and the clock. Only src/app startup and src/lib call these.
export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
