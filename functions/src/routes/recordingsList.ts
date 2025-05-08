import { Router } from 'express'
import { recordingsCollection } from '../config/firebase'

const router = Router()

router.get('/', async (req, res) => {
  let q = recordingsCollection.orderBy('uploadedAt', 'desc')
  if (req.query.userId) q = q.where('userId', '==', req.query.userId)
  const snap = await q.limit(100).get()
  const recs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
  res.json({ success: true, count: recs.length, recordings: recs })
})

export default router
