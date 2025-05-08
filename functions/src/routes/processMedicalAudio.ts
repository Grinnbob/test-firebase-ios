import { Router } from 'express'
import Busboy from 'busboy'
import os from 'os'
import fs from 'fs'
import path from 'path'
import { generateRequestSignature, requestDeduplicationMap } from '../utils/dedupe'
import { transcribeAudio, getMedicalRecommendations } from '../services/audio'
import { uploadToFirebaseStorage } from '../services/storage'
import { saveRecordingToFirestore } from '../services/firestore'
import { createFirestoreTimestamp } from '../utils/timestamp'
import { FileData } from '../types/FileData'
import { RecordingDocument } from '../types/Recording'

const router = Router()

router.post('/', async (req, res) => {
  if (!req.headers['content-type']) {
    return res.status(400).json({ success: false, message: 'Missing Content-Type header' })
  }

  // Deduplication
  const sig = generateRequestSignature(req)
  const seen = requestDeduplicationMap.get(sig)
  if (seen && Date.now() - seen.timestamp < 30000) {
    return res.status(200).json({
      success: true,
      message: 'Request already processed',
      recordingId: seen.recordingId,
      isDuplicate: true
    })
  }

  // Busboy file parsing
  let fileData: FileData | null = null
  let apiKey: string | null = null
  await new Promise<void>((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 } })
    let writePromise: Promise<void> | null = null

    bb.on('file', (field, stream, info) => {
      if (field !== 'audio') { stream.resume(); return }
      const tmp = path.join(os.tmpdir(), `${Date.now()}-${info.filename}`)
      fileData = {
        fieldname: field,
        originalname: info.filename,
        mimetype: info.mimeType,
        path: tmp,
        encoding: info.encoding
      }
      const ws = fs.createWriteStream(tmp)
      writePromise = new Promise((resF, rejF) => {
        ws.on('finish', () => {
          const stats = fs.statSync(tmp)
          fileData!.size = stats.size
          resF()
        })
        ws.on('error', rejF)
      })
      stream.pipe(ws)
    })

    bb.on('field', (name, val) => {
      if (name === 'apiKey') apiKey = val
    })

    bb.on('close', async () => {
      if (writePromise) {
        try { await writePromise; resolve() }
        catch (e) { reject(e) }
      } else resolve()
    })
    bb.on('error', reject)
    req.pipe(bb)
  })

  if (!fileData) return res.status(400).json({ success: false, message: 'No audio uploaded' })
  if (!fs.existsSync(fileData.path)) return res.status(500).json({ success: false, message: 'Upload failed' })

  // Use provided API key or default
  if (apiKey) (global as any).openai = new (await import('openai')).OpenAI({ apiKey })
  else await import('../config/openaiClient').then(m => m.getOpenAI())

  const ext = path.extname(fileData.originalname)
  const fileName = `${Date.now()}${ext}`
  const storageUrl = await uploadToFirebaseStorage(fileData.path, fileName, fileData.mimetype)
  const transcript = await transcribeAudio(fileData.path)
  const recommendations = await getMedicalRecommendations(transcript)

  let uploadedAt = createFirestoreTimestamp()
  const record: RecordingDocument = {
    filename: fileName,
    path: `audio/${fileName}`,
    storageUrl,
    size: fileData.size!,
    uploadedAt,
    transcript,
    recommendations,
    userId: (req as any).user?.uid || null,
    metadata: { originalFilename: fileData.originalname, mimeType: fileData.mimetype }
  }
  const id = await saveRecordingToFirestore(record)
  requestDeduplicationMap.set(sig, { timestamp: Date.now(), recordingId: id })

  // cleanup temp
  fs.unlinkSync(fileData.path)
  res.json({ success: true, recordingId: id, transcript, recommendations, file: record })
})

export default router
