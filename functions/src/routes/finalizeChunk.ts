import { Router } from 'express'

const router = Router()
router.post('/', async (req, res) => {
  // … merge chunks, upload final file, save record, cleanup …
})

export default router
