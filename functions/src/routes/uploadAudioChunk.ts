import { Router } from 'express'
import Busboy from 'busboy'
import fs from 'fs'
import path from 'path'
import { ChunkSession } from '../types/Chunk'

const router = Router()
const chunksDir = path.join(__dirname, '../chunks')
if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir)

const sessions = new Map<string, ChunkSession>()

router.post('/', async (req, res) => {
  let filePath: string, sessionId = '', chunkNumber = 0, totalChunks = 0, originalFilename = '', mimeType = ''
  await new Promise<void>((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 } })
    let wp: Promise<void> | null = null

    bb.on('field', (n, v) => {
      if (n === 'sessionId') sessionId = v
      if (n === 'chunkNumber') chunkNumber = +v
      if (n === 'totalChunks') totalChunks = +v
      if (n === 'filename') originalFilename = v
      if (n === 'mimeType') mimeType = v
    })

    bb.on('file', (_f, stream, info) => {
      const dir = path.join(chunksDir, sessionId)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir)
      filePath = path.join(dir, `chunk_${chunkNumber}.part`)
      const ws = fs.createWriteStream(filePath)
      wp = new Promise((resF, rejF) => {
        ws.on('finish', () => {
          resF()
        })
        ws.on('error', rejF)
      })
      stream.pipe(ws)
    })

    bb.on('close', async () => {
      if (wp) { try { await wp; resolve() } catch (e) { reject(e) } }
      else reject(new Error('No chunk'))
    })
    bb.on('error', reject)
    req.pipe(bb)
  })

  if (!sessions.has(sessionId) && chunkNumber === 1) {
    sessions.set(sessionId, {
      sessionId,
      chunks: new Map(),
      totalChunks,
      originalFilename,
      mimeType,
      createdAt: Date.now()
    })
  }
  const sess = sessions.get(sessionId)!
  sess.chunks.set(chunkNumber, { path: filePath!, size: fs.statSync(filePath!).size, chunkNumber })

  res.json({
    success: true,
    sessionId,
    chunkNumber,
    totalChunks,
    remaining: totalChunks - sess.chunks.size
  })
})

export default router
