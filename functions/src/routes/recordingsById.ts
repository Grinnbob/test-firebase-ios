import { Router } from 'express'
import { deleteRecordingById } from '../services/firestore'
import { recordingsCollection } from '../config/firebase'

const router = Router()

router.delete('/', async (req, res) => {
  const id = req.params.id
  await deleteRecordingById(id)
  res.json({ success: true, id })
})

router.get('/', async (req, res) => {
  const id = req.params.id
  const doc = await recordingsCollection.doc(id).get()
  if (!doc.exists) return res.status(404).json({ success: false, message: 'Not found' })
  res.json({ success: true, recording: { id: doc.id, ...doc.data() } })
})

export default router
