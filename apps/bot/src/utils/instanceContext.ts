import type { ResolvedInstance } from './instanceResolver.js';

let currentInstance: ResolvedInstance | null = null;

export function setCurrentInstance(instance: ResolvedInstance) {
  currentInstance = instance;
}

export function getCurrentInstance(): ResolvedInstance {
  if (!currentInstance) {
    throw new Error('Instance context not initialized. Call setCurrentInstance() first.');
  }
  return currentInstance;
}

export function isWhiteLabelInstance(): boolean {
  return currentInstance != null && !currentInstance.isDefault;
}

export function getInstanceId(): string {
  return currentInstance?.id ?? '__default__';
}

export function parseInstanceIdFromArgs(): string {
  for (const arg of process.argv) {
    if (arg.startsWith('--instance-id=')) {
      return arg.split('=')[1];
    }
  }
  return '__default__';
}
