import { Router } from 'express'
import { recordingsCollection } from '../config/firebase'

const router = Router()
router.get('/', async (req, res) => {
  let query = recordingsCollection.orderBy('uploadedAt', 'desc')
  if (req.query.userId) query = query.where('userId', '==', req.query.userId)
  const snapshot = await query.limit(100).get()
  const recordings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
  res.json({ success: true, count: recordings.length, recordings })
})

export default router
