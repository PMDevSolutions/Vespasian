/** Minimal logger interface so core modules log without depending on a concrete sink. */
export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

export const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
  debug: (m) => {
    // VESPASIAN_DEBUG is a GUI-development-only env var (documented in
    // docs/GUI.md) — deliberately outside the runtime contract's WIX_*/
    // VESPASIAN_* set, which is why .env.example does not list it.
    if (process.env.VESPASIAN_DEBUG) console.debug(m);
  },
};

export const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};
