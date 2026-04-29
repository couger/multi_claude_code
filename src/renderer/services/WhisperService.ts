export interface WhisperServiceState {
  wasmSupported: boolean | null;
  modelLoaded: boolean;
  loading: boolean;
  loadingProgress: number;
  currentModel: string | null;
  error: string | null;
  crashed: boolean;
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
  crashed: false,
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

  /**
   * 从本地文件加载模型（手动下载方式）
   * 用户可先手动下载 .bin 文件，再通过此方法加载
   */
  async loadModelFromFile(data: Uint8Array, modelId: string): Promise<boolean> {
    if (this.state.loading) return false;

    this.setState({ loading: true, loadingProgress: 0, error: null });

    try {
      const { WhisperWasmService } = await this.ensureModule();
      if (!this.whisper) {
        this.whisper = new WhisperWasmService({ logLevel: 1 });
      }

      await this.whisper.initModel(data);

      localStorage.setItem('whisperWasm.modelId', modelId);
      this.setState({
        loading: false,
        loadingProgress: 100,
        modelLoaded: true,
        currentModel: modelId,
        crashed: false,
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
          // progress 已经是 0-100 的百分比
          this.setState({ loadingProgress: Math.round(progress) });
        },
      );

      await this.whisper.initModel(modelData);

      localStorage.setItem('whisperWasm.modelId', modelId);
      this.setState({
        loading: false,
        loadingProgress: 100,
        modelLoaded: true,
        currentModel: modelId,
        crashed: false,
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

  // 简单的线性重采样
  private resample(data: Float32Array, fromRate: number, toRate: number): Float32Array {
    if (fromRate === toRate) return data;
    const ratio = fromRate / toRate;
    const newLength = Math.floor(data.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIdx = i * ratio;
      const srcIdxFloor = Math.floor(srcIdx);
      const frac = srcIdx - srcIdxFloor;
      const a = data[srcIdxFloor] || 0;
      const b = data[srcIdxFloor + 1] || a;
      result[i] = a + (b - a) * frac;
    }
    return result;
  }

  async transcribe(audioArrayBuffer: ArrayBuffer): Promise<string | null> {
    if (!this.whisper || !this.state.modelLoaded) return null;

    if (this.state.crashed) {
      console.warn('[WhisperService] WASM 之前发生崩溃，已禁用。请重新加载模型。');
      return null;
    }

    const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
    if (audioArrayBuffer.byteLength > MAX_AUDIO_SIZE) {
      console.warn('[WhisperService] 音频过大，已截断:', audioArrayBuffer.byteLength);
      audioArrayBuffer = audioArrayBuffer.slice(0, MAX_AUDIO_SIZE);
    }
    if (audioArrayBuffer.byteLength < 1000) {
      console.warn('[WhisperService] 音频过短，跳过识别');
      return null;
    }

    // 使用浏览器原生 AudioContext 解码（不经过 convertFromArrayBuffer，避免 WASM 崩溃）
    let audioContext: AudioContext | null = null;
    try {
      console.log('[WhisperService] 开始转录, 大小:', audioArrayBuffer.byteLength);

      // 用浏览器原生 API 解码音频（对 webm/opus 支持最稳定）
      audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(audioArrayBuffer.slice(0));
      console.log('[WhisperService] 解码完成, 采样率:', audioBuffer.sampleRate, '声道:', audioBuffer.numberOfChannels, '时长:', audioBuffer.duration);

      // 提取第一个声道，重采样到 16kHz
      const rawData = audioBuffer.getChannelData(0);
      let audioData: Float32Array;
      if (audioBuffer.sampleRate !== 16000) {
        audioData = new Float32Array(this.resample(rawData, audioBuffer.sampleRate, 16000));
        console.log('[WhisperService] 重采样完成, 16kHz 样本数:', audioData.length);
      } else {
        audioData = new Float32Array(rawData);
      }

      // 关闭 AudioContext，释放资源
      audioContext.close();
      audioContext = null;

      // 直接传 Float32Array 给 whisper.transcribe（绕过 convertFromArrayBuffer）
      console.log('[WhisperService] 开始 WASM 识别...');
      const result = await Promise.race([
        this.whisper.transcribe(audioData, undefined, {
          language: 'zh',
          threads: 1,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('WASM transcription timed out')), 30000)
        ),
      ]);

      if (!result?.segments?.length) {
        console.warn('[WhisperService] 转录结果为空');
        return null;
      }
      console.log('[WhisperService] 转录完成');
      return result.segments.map((s) => s.text.trim()).filter(Boolean).join('');
    } catch (e) {
      console.error('[WhisperService] Transcription failed:', e);
      this.setState({ crashed: true });
      return null;
    } finally {
      if (audioContext) {
        try { audioContext.close(); } catch { /* ignore */ }
      }
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

  async isModelCached(modelId: string): Promise<boolean> {
    try {
      if (!this.modelManager) {
        const { ModelManager } = await this.ensureModule();
        this.modelManager = new ModelManager({ logLevel: 1 });
      }
      const models = await this.modelManager.getAvailableModels();
      const model = models.find(m => m.id === modelId);
      return model?.cached || false;
    } catch {
      return false;
    }
  }

  async getCacheInfo() {
    if (!this.modelManager) {
      const { ModelManager } = await this.ensureModule();
      this.modelManager = new ModelManager({ logLevel: 1 });
    }
    return this.modelManager.getCacheInfo();
  }
}

export const whisperService = new WhisperService();
