// What the card can ask of Claude; main.tsx wires these to the MCP Apps host.
export interface CardActions {
  /** Puts a message in the chat; resolves true when the host took it. */
  ask: (text: string) => Promise<boolean>;
  expand: () => void;
  open: (url: string) => void;
}
