/// <reference types="vite/client" />
import type { VespasianBridge } from '../shared/types/ipc';

declare global {
  interface Window {
    vespasian: VespasianBridge;
  }
}

export {};
