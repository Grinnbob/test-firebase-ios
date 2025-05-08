import { Router } from 'express'
import { deleteAllRecordings } from '../services/firestore'

const router = Router()

router.delete('/', async (req, res) => {
  const count = await deleteAllRecordings(req.query.userId as string | undefined)
  res.json({ success: true, count })
})

export default router

