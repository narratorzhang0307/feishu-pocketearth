import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import {
  clearChunkReloadAttempt,
  recoverChunkLoadFailure,
} from './chunkReloadGuard';

/**
 * Applies the same stale-PWA recovery to non-React dynamic imports such as
 * map data, EXIF helpers and 3D runtimes. These chunks are still downloaded
 * only when their feature is opened.
 */
export async function importWithChunkRecovery<T>(
  factory: () => Promise<T>,
): Promise<T> {
  try {
    const module = await factory();
    clearChunkReloadAttempt();
    return module;
  } catch (error) {
    if (await recoverChunkLoadFailure()) {
      return new Promise<T>(() => {});
    }
    throw error;
  }
}

/**
 * React.lazy with one safe recovery attempt for an installed PWA that still
 * references a hashed chunk from the previous deployment.
 */
export function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy<T>(() => importWithChunkRecovery(factory));
}
