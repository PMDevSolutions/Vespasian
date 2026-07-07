import type { VespasianBridge } from '../../shared/types/ipc';

/** Access the preload-exposed bridge, failing loudly if it's missing. */
export function bridge(): VespasianBridge {
  if (!window.vespasian) {
    throw new Error('Vespasian bridge unavailable — the preload script did not initialize.');
  }
  return window.vespasian;
}
