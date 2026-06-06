import type { JarvisMemoryEvent, JarvisMemoryEventType } from './types';

const MEMORY_KEY = 'jarvis:business_memory';
const MAX_MEMORY_EVENTS = 80;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeParseEvents(raw: string | null): JarvisMemoryEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function sanitizeMemorySummary(summary: string): string {
  return String(summary || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '저장된 이메일')
    .replace(/\b(?:010|011|016|017|018|019)[-\s.]?\d{3,4}[-\s.]?\d{4}\b/g, '연락처')
    .replace(/([A-Za-z0-9+/]{80,}={0,2})/g, '첨부 데이터')
    .slice(0, 500);
}

export function readJarvisBusinessMemory(types?: JarvisMemoryEventType[]): JarvisMemoryEvent[] {
  if (!canUseStorage()) return [];
  const events = safeParseEvents(window.localStorage.getItem(MEMORY_KEY));
  const filtered = types?.length ? events.filter(event => types.includes(event.type)) : events;
  return filtered.slice(0, MAX_MEMORY_EVENTS);
}

export function rememberJarvisEvent(input: Omit<JarvisMemoryEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): JarvisMemoryEvent | null {
  if (!canUseStorage()) return null;
  const event: JarvisMemoryEvent = {
    ...input,
    id: input.id || `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt || new Date().toISOString(),
    summary: sanitizeMemorySummary(input.summary),
  };
  const current = readJarvisBusinessMemory();
  const next = [event, ...current].slice(0, MAX_MEMORY_EVENTS);
  window.localStorage.setItem(MEMORY_KEY, JSON.stringify(next));
  return event;
}

export function rememberNamedSnapshot(key: string, value: unknown): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(`jarvis:${key}`, JSON.stringify(value));
  } catch {
    // Browser storage can be full or disabled. Memory is useful, not critical.
  }
}
