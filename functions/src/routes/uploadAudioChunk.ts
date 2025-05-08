import { Router } from 'express'
import busboy from '../middleware/busboy'

const router = Router()
router.post('/', busboy, async (req, res) => {
  // … chunk parsing & session tracking logic …
})

export default router
