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
    const ids = ['ckabc123defg456hij789klm1', 'ckabc123defg456hij789klm2']

    it('accepts quiz type with sourceIds', () => {
      const result = generationConfigSchema.parse({ type: 'quiz', sourceIds: ids, config: { questionCount: 5 } })
      expect(result.type).toBe('quiz')
      expect(result.config.questionCount).toBe(5)
      expect(result.sourceIds).toEqual([...ids].sort())
    })

    it('accepts flashcards type', () => {
      const result = generationConfigSchema.parse({ type: 'flashcards', sourceIds: ids, config: { count: 10 } })
      expect(result.type).toBe('flashcards')
    })

    it('accepts summary type with topic', () => {
      const result = generationConfigSchema.parse({ type: 'summary', sourceIds: ids, config: { length: 'short', topic: 'normalization' } })
      expect(result.type).toBe('summary')
      if (result.type === 'summary') expect(result.config.topic).toBe('normalization')
    })

    it('accepts report type', () => {
      const result = generationConfigSchema.parse({ type: 'report', sourceIds: ids, config: {} })
      expect(result.type).toBe('report')
    })

    it('accepts mindmap type', () => {
      const result = generationConfigSchema.parse({ type: 'mindmap', sourceIds: ids, config: {} })
      expect(result.type).toBe('mindmap')
    })

    it('rejects unknown type', () => {
      expect(() => generationConfigSchema.parse({ type: 'unknown', sourceIds: ids, config: {} })).toThrow()
    })

    it('rejects empty sourceIds instead of silently using all notebook sources', () => {
      expect(() => generationConfigSchema.parse({ type: 'quiz', sourceIds: [], config: {} })).toThrow()
    })

    it('rejects missing sourceIds', () => {
      expect(() => generationConfigSchema.parse({ type: 'quiz', config: {} })).toThrow()
    })

    it('dedupes and sorts sourceIds deterministically', () => {
      const result = generationConfigSchema.parse({ type: 'quiz', sourceIds: [ids[1], ids[0], ids[1]], config: {} })
      expect(result.sourceIds).toEqual([...ids].sort())
    })

    it('coerces numeric strings from the UI (questionCount "10" -> 10)', () => {
      const result = generationConfigSchema.parse({ type: 'quiz', sourceIds: ids, config: { questionCount: '10', difficulty: 'medium' } })
      if (result.type === 'quiz') expect(result.config.questionCount).toBe(10)
    })
  })
})