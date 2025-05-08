export interface ChunkInfo {
    path: string
    size: number
    chunkNumber: number
  }
  
  export interface ChunkSession {
    sessionId: string
    chunks: Map<number, ChunkInfo>
    totalChunks: number
    originalFilename: string
    mimeType: string
    createdAt: number
  }
  