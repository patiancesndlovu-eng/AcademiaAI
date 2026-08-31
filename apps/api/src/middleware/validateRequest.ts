import { Request, Response, NextFunction } from 'express'
import { ZodSchema, ZodError } from 'zod'
import { error } from '../utils/response'

export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        return res.status(400).json(error('VALIDATION_ERROR', messages))
      }
      next(err)
    }
  }
}

export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.params = schema.parse(req.params)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        return res.status(400).json(error('VALIDATION_ERROR', messages))
      }
      next(err)
    }
  }
}

export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query)
      next()
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
        return res.status(400).json(error('VALIDATION_ERROR', messages))
      }
      next(err)
    }
  }
}