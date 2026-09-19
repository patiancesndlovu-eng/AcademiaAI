import { describe, it, expect } from 'vitest'
import {
  generationConfigSchema,
  quizConfigSchema,
  flashcardsConfigSchema,
  summaryConfigSchema,
  reportConfigSchema,
  mindmapConfigSchema,
} from '../../src/schemas/generation'

describe('generation config schemas (spec §60)', () => {
  describe('quizConfigSchema', () => {
    it('accepts valid config with defaults', () => {
      const result = quizConfigSchema.parse({})
      expect(result.questionCount).toBe(10)
      expect(result.difficulty).toBe('medium')
    })

    it('accepts valid custom config', () => {
      const result = quizConfigSchema.parse({ questionCount: 20, difficulty: 'hard' })
      expect(result.questionCount).toBe(20)
      expect(result.difficulty).toBe('hard')
    })

    it('rejects questionCount < 5', () => {
      expect(() => quizConfigSchema.parse({ questionCount: 4 })).toThrow()
    })

    it('rejects questionCount > 50', () => {
      expect(() => quizConfigSchema.parse({ questionCount: 51 })).toThrow()
    })

    it('rejects invalid difficulty', () => {
      expect(() => quizConfigSchema.parse({ difficulty: 'impossible' })).toThrow()
    })
  })

  describe('flashcardsConfigSchema', () => {
    it('accepts valid config with defaults', () => {
      const result = flashcardsConfigSchema.parse({})
      expect(result.count).toBe(20)
    })

    it('rejects count < 5', () => {
      expect(() => flashcardsConfigSchema.parse({ count: 4 })).toThrow()
    })

    it('rejects count > 100', () => {
      expect(() => flashcardsConfigSchema.parse({ count: 101 })).toThrow()
    })
  })

  describe('summaryConfigSchema', () => {
    it('accepts valid config with defaults', () => {
      const result = summaryConfigSchema.parse({})
      expect(result.length).toBe('medium')
    })

    it('rejects invalid length', () => {
      expect(() => summaryConfigSchema.parse({ length: 'xl' })).toThrow()
    })
  })

  describe('reportConfigSchema', () => {
    it('accepts valid config', () => {
      const result = reportConfigSchema.parse({ length: 'long', focus: 'biology' })
      expect(result.length).toBe('long')
      expect(result.focus).toBe('biology')
    })

    it('rejects focus > 200 chars', () => {
      expect(() => reportConfigSchema.parse({ focus: 'x'.repeat(201) })).toThrow()
    })
  })

  describe('mindmapConfigSchema', () => {
    it('accepts valid config with defaults', () => {
      const result = mindmapConfigSchema.parse({})
      expect(result.maxNodes).toBe(50)
      expect(result.depth).toBe(3)
    })

    it('rejects maxNodes > 200', () => {
      expect(() => mindmapConfigSchema.parse({ maxNodes: 201 })).toThrow()
    })

    it('rejects depth > 5', () => {
      expect(() => mindmapConfigSchema.parse({ depth: 6 })).toThrow()
    })
  })

  describe('generationConfigSchema (discriminated union)', () => {
    it('accepts quiz type', () => {
      const result = generationConfigSchema.parse({ type: 'quiz', config: { questionCount: 5 } })
      expect(result.type).toBe('quiz')
      expect(result.config.questionCount).toBe(5)
    })

    it('accepts flashcards type', () => {
      const result = generationConfigSchema.parse({ type: 'flashcards', config: { count: 10 } })
      expect(result.type).toBe('flashcards')
    })

    it('accepts summary type', () => {
      const result = generationConfigSchema.parse({ type: 'summary', config: { length: 'short' } })
      expect(result.type).toBe('summary')
    })

    it('accepts report type', () => {
      const result = generationConfigSchema.parse({ type: 'report', config: {} })
      expect(result.type).toBe('report')
    })

    it('accepts mindmap type', () => {
      const result = generationConfigSchema.parse({ type: 'mindmap', config: {} })
      expect(result.type).toBe('mindmap')
    })

    it('rejects unknown type', () => {
      expect(() => generationConfigSchema.parse({ type: 'unknown', config: {} })).toThrow()
    })
  })
})