import type { ResolvedInstance } from './instanceResolver.js';

let currentInstance: ResolvedInstance | null = null;

export function setCurrentInstance(instance: ResolvedInstance) {
  currentInstance = instance;
}

/**
 * Remet le contexte d'instance a zero.
 *
 * Destine aux tests : `setCurrentInstance` ecrit dans un etat global au
 * process, donc un fichier de test qui l'appelle modifie le comportement de
 * `getJwtSecret()`, `getDiscordClientId()` et consorts pour tous les fichiers
 * executes ensuite. Les tests qui s'appuient sur les valeurs de repli issues
 * des variables d'environnement doivent appeler cette fonction pour ne pas
 * dependre de leur ordre d'execution.
 */
export function resetCurrentInstance() {
  currentInstance = null;
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
