import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { uploadToFirebaseStorage } from '../services/storage'
import { saveRecordingToFirestore } from '../services/firestore'
import { createFirestoreTimestamp } from '../utils/timestamp'
import { sessions } from './uploadAudioChunk'

const router = Router()

router.post('/', async (req, res) => {
  const { sessionId } = req.body
  const sess = sessions.get(sessionId)
  if (!sess) return res.status(400).json({ success: false, message: 'Session not found' })
  if (sess.chunks.size !== sess.totalChunks) {
    return res.status(400).json({ success: false, message: 'Missing chunks', received: Array.from(sess.chunks.keys()) })
  }

  const ext = path.extname(sess.originalFilename)
  const outName = `${Date.now()}${ext}`
  const tmpOut = path.join(os.tmpdir(), outName)
  const ws = fs.createWriteStream(tmpOut)

  // merge
  for (let i = 1; i <= sess.totalChunks; i++) {
    const info = sess.chunks.get(i)!
    fs.createReadStream(info.path).pipe(ws, { end: false })
    await new Promise(r => ws.once('drain', r))
  }
  ws.end()

  ws.on('finish', async () => {
    const storageUrl = await uploadToFirebaseStorage(tmpOut, outName, sess.mimeType)
    const uploadedAt = createFirestoreTimestamp()
    const recData = {
      filename: outName,
      path: `audio/${outName}`,
      storageUrl,
      size: fs.statSync(tmpOut).size,
      uploadedAt,
      userId: null,
      metadata: { originalFilename: sess.originalFilename, mimeType: sess.mimeType }
    }
    const id = await saveRecordingToFirestore(recData)
    // cleanup
    fs.unlinkSync(tmpOut)
    sess.chunks.forEach(c => fs.unlinkSync(c.path))
    sessions.delete(sessionId)
    res.json({ success: true, recordingId: id, file: recData })
  })

  ws.on('error', e => res.status(500).json({ success: false, message: e.message }))
})

export default router
