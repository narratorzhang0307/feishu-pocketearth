export type PhotoOrganizerRequest = { files: File[]; objective: string };

let pending: PhotoOrganizerRequest | null = null;
const listeners = new Set<(request: PhotoOrganizerRequest) => void>();

export function submitPhotoOrganizerRequest(request: PhotoOrganizerRequest): void {
  pending = request;
  listeners.forEach((listener) => listener(request));
}

export function consumePhotoOrganizerRequest(): PhotoOrganizerRequest | null {
  const request = pending;
  pending = null;
  return request;
}

export function subscribePhotoOrganizerRequests(listener: (request: PhotoOrganizerRequest) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
