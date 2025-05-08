import { Router } from 'express'
import Busboy from 'busboy'
import os from 'os'
import fs from 'fs'
import path from 'path'
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

  let fileData: FileData | null = null
  let skipAI = req.query.skipAI === 'true'

  await new Promise<void>((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 } })
    let wp: Promise<void> | null = null

    bb.on('file', (field, stream, info) => {
      if (field !== 'audio') { stream.resume(); return }
      const tmp = path.join(os.tmpdir(), `${Date.now()}-${info.filename}`)
      fileData = { fieldname: field, originalname: info.filename, mimetype: info.mimeType, path: tmp, encoding: info.encoding }
      const ws = fs.createWriteStream(tmp)
      wp = new Promise((resF, rejF) => {
        ws.on('finish', () => {
          fileData!.size = fs.statSync(tmp).size
          resF()
        })
        ws.on('error', rejF)
      })
      stream.pipe(ws)
    })

    bb.on('close', async () => {
      if (wp) { try { await wp; resolve() } catch (e) { reject(e) } }
      else resolve()
    })
    bb.on('error', reject)
    req.pipe(bb)
  })

  if (!fileData) return res.status(400).json({ success: false, message: 'No audio uploaded' })
  if (!fs.existsSync(fileData.path)) return res.status(500).json({ success: false, message: 'Upload failed' })

  const ext = path.extname(fileData.originalname)
  const fileName = `${Date.now()}${ext}`
  const storageUrl = await uploadToFirebaseStorage(fileData.path, fileName, fileData.mimetype)

  let transcript = '', recommendations = ''
  if (!skipAI) {
    const { transcribeAudio, getMedicalRecommendations } = await import('../services/audio')
    transcript = await transcribeAudio(fileData.path)
    recommendations = await getMedicalRecommendations(transcript)
  }

  const uploadedAt = createFirestoreTimestamp()
  const record: RecordingDocument = {
    filename: fileName, path: `audio/${fileName}`, storageUrl,
    size: fileData.size!, uploadedAt, transcript, recommendations,
    userId: (req as any).user?.uid || null,
    metadata: { originalFilename: fileData.originalname, mimeType: fileData.mimetype }
  }
  const id = await saveRecordingToFirestore(record)
  fs.unlinkSync(fileData.path)
  res.json({ success: true, recordingId: id, file: record, transcript, recommendations })
})

export default router
