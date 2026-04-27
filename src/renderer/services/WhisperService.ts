export interface WhisperServiceState {
  wasmSupported: boolean | null;
  modelLoaded: boolean;
  loading: boolean;
  loadingProgress: number;
  currentModel: string | null;
  error: string | null;
}

type Listener = () => void;

type WhisperWasmService = import('@timur00kh/whisper.wasm').WhisperWasmService;
type ModelManager = import('@timur00kh/whisper.wasm').ModelManager;
type ModelID = import('@timur00kh/whisper.wasm').ModelID;

const INITIAL_STATE: WhisperServiceState = {
  wasmSupported: null,
  modelLoaded: false,
  loading: false,
  loadingProgress: 0,
  currentModel: null,
  error: null,
};

class WhisperService {
  private whisper: WhisperWasmService | null = null;
  private modelManager: ModelManager | null = null;
  private state: WhisperServiceState = { ...INITIAL_STATE };
  // 缓存快照，保证引用稳定，避免 useSyncExternalStore 无限重渲染
  private snapshot: WhisperServiceState = this.state;
  private listeners = new Set<Listener>();

  getState(): WhisperServiceState {
    return this.snapshot;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.snapshot = { ...this.state };
    for (const l of this.listeners) l();
  }

  private setState(patch: Partial<WhisperServiceState>) {
    this.state = { ...this.state, ...patch };
    this.notify();
  }

  private async ensureModule() {
    return import('@timur00kh/whisper.wasm');
  }

  async checkSupport(): Promise<boolean> {
    try {
      const { WhisperWasmService } = await this.ensureModule();
      if (!this.whisper) {
        this.whisper = new WhisperWasmService({ logLevel: 1 });
      }
      const supported = await this.whisper.checkWasmSupport();
      this.setState({ wasmSupported: supported });
      return supported;
    } catch {
      this.setState({ wasmSupported: false });
      return false;
    }
  }

  async loadModel(modelId: string): Promise<boolean> {
    if (this.state.loading) return false;

    this.setState({ loading: true, loadingProgress: 0, error: null });

    try {
      const { WhisperWasmService, ModelManager } = await this.ensureModule();
      if (!this.whisper) {
        this.whisper = new WhisperWasmService({ logLevel: 1 });
      }
      if (!this.modelManager) {
        this.modelManager = new ModelManager({ logLevel: 1 });
      }

      const modelData = await this.modelManager.loadModel(
        modelId as ModelID,
        true,
        (progress: number) => {
          this.setState({ loadingProgress: Math.round(progress * 100) });
        },
      );

      await this.whisper.initModel(modelData);

      localStorage.setItem('whisperWasm.modelId', modelId);
      this.setState({
        loading: false,
        loadingProgress: 100,
        modelLoaded: true,
        currentModel: modelId,
      });
      return true;
    } catch (e: any) {
      this.setState({
        loading: false,
        error: e?.message || String(e),
      });
      return false;
    }
  }

  async transcribe(audioArrayBuffer: ArrayBuffer): Promise<string | null> {
    if (!this.whisper || !this.state.modelLoaded) return null;

    try {
      const { convertFromArrayBuffer } = await this.ensureModule();
      const { audioData } = await convertFromArrayBuffer(audioArrayBuffer);
      const result = await this.whisper.transcribe(audioData, undefined, {
        language: 'zh',
        threads: navigator.hardwareConcurrency || 4,
      });
      return result.segments.map((s) => s.text.trim()).filter(Boolean).join('');
    } catch (e) {
      console.error('[WhisperService] Transcription failed:', e);
      return null;
    }
  }

  unloadModel() {
    this.whisper = null;
    this.modelManager = null;
    localStorage.removeItem('whisperWasm.modelId');
    this.setState({ modelLoaded: false, currentModel: null, loadingProgress: 0 });
  }

  getAvailableModels() {
    if (this.modelManager) {
      return this.modelManager.getAvailableModelsSync();
    }
    return [
      { id: 'tiny', name: 'Tiny', size: 75_000_000, language: 'multilingual' as const, quantized: false },
      { id: 'base', name: 'Base', size: 142_000_000, language: 'multilingual' as const, quantized: false },
      { id: 'small', name: 'Small', size: 466_000_000, language: 'multilingual' as const, quantized: false },
      { id: 'medium-q5_0', name: 'Medium Q5', size: 515_000_000, language: 'multilingual' as const, quantized: true },
      { id: 'large-q5_0', name: 'Large Q5', size: 1_030_000_000, language: 'multilingual' as const, quantized: true },
    ];
  }

  async clearCache() {
    if (!this.modelManager) {
      const { ModelManager } = await this.ensureModule();
      this.modelManager = new ModelManager({ logLevel: 1 });
    }
    await this.modelManager.clearCache();
  }
}

export const whisperService = new WhisperService();
