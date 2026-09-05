import express, { Router } from 'express';

const router: Router = express.Router();

router.post('/', (req, res) => {
  res.json({ message: "Upload route initialized" });
});

export default router;