import { useSyncExternalStore, useCallback } from 'react';
import { whisperService, type WhisperServiceState } from '../services/WhisperService';

export function useWhisperService() {
  const state = useSyncExternalStore(
    (cb) => whisperService.subscribe(cb),
    () => whisperService.getState(),
  );

  return {
    state,
    checkSupport: useCallback(() => whisperService.checkSupport(), []),
    loadModel: useCallback((id: string) => whisperService.loadModel(id), []),
    transcribe: useCallback((audio: ArrayBuffer) => whisperService.transcribe(audio), []),
    unloadModel: useCallback(() => whisperService.unloadModel(), []),
    getAvailableModels: useCallback(() => whisperService.getAvailableModels(), []),
    clearCache: useCallback(() => whisperService.clearCache(), []),
  };
}
