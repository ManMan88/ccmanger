import { z } from 'zod'

// Common types
export const AgentStatusSchema = z.enum(['running', 'waiting', 'error', 'finished'])
export const AgentModeSchema = z.enum(['auto', 'plan', 'regular'])
export const SortModeSchema = z.enum(['free', 'status', 'name'])
export const PermissionSchema = z.enum(['read', 'write', 'execute'])
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool'])
export const UsagePeriodSchema = z.enum(['daily', 'weekly', 'monthly'])

// ID schemas
export const WorkspaceIdSchema = z.string().regex(/^ws_[a-z0-9]+$/i, 'Invalid workspace ID')
export const WorktreeIdSchema = z.string().regex(/^wt_[a-z0-9]+$/i, 'Invalid worktree ID')
export const AgentIdSchema = z.string().regex(/^ag_[a-z0-9]+$/i, 'Invalid agent ID')
export const MessageIdSchema = z.string().regex(/^msg_[a-z0-9]+$/i, 'Invalid message ID')

// Workspace schemas
export const CreateWorkspaceSchema = z.object({
  path: z
    .string()
    .min(1, 'Path is required')
    .refine((path) => path.startsWith('/'), 'Path must be absolute'),
})

export const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

// Worktree schemas
export const CreateWorktreeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  branch: z.string().min(1, 'Branch is required').max(100, 'Branch name too long'),
  createBranch: z.boolean().optional().default(false),
})

export const UpdateWorktreeSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  sortMode: SortModeSchema.optional(),
  order: z.number().int().min(0).optional(),
})

export const CheckoutBranchSchema = z.object({
  branch: z.string().min(1, 'Branch is required').max(100, 'Branch name too long'),
  createBranch: z.boolean().optional().default(false),
})

export const ReorderWorktreesSchema = z.object({
  worktreeIds: z.array(WorktreeIdSchema).min(1, 'At least one worktree ID required'),
})

// Agent schemas
export const CreateAgentSchema = z.object({
  worktreeId: WorktreeIdSchema,
  name: z.string().min(1).max(100).optional(),
  mode: AgentModeSchema.optional().default('regular'),
  permissions: z.array(PermissionSchema).optional().default(['read']),
  initialPrompt: z.string().max(50000).optional(),
})

export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  mode: AgentModeSchema.optional(),
  permissions: z.array(PermissionSchema).optional(),
})

export const SendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(50000, 'Message too long'),
})

export const ReorderAgentsSchema = z.object({
  worktreeId: WorktreeIdSchema,
  agentIds: z.array(AgentIdSchema).min(1, 'At least one agent ID required'),
})

export const ForkAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

export const StartAgentSchema = z.object({
  initialPrompt: z.string().max(50000).optional(),
})

export const StopAgentSchema = z.object({
  force: z.boolean().optional().default(false),
})

// Query parameter schemas
export const AgentQuerySchema = z.object({
  worktreeId: WorktreeIdSchema.optional(),
  status: AgentStatusSchema.optional(),
  includeDeleted: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
})

export const MessageQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 100))
    .refine((v) => v > 0 && v <= 1000, 'Limit must be between 1 and 1000'),
  before: MessageIdSchema.optional(),
})

export const UsageQuerySchema = z.object({
  period: UsagePeriodSchema.optional(),
  start: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Invalid date format (YYYY-MM-DD)'),
  end: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Invalid date format (YYYY-MM-DD)'),
})

// Type exports
export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>
export type CreateWorktreeInput = z.infer<typeof CreateWorktreeSchema>
export type UpdateWorktreeInput = z.infer<typeof UpdateWorktreeSchema>
export type CheckoutBranchInput = z.infer<typeof CheckoutBranchSchema>
export type ReorderWorktreesInput = z.infer<typeof ReorderWorktreesSchema>
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>
export type SendMessageInput = z.infer<typeof SendMessageSchema>
export type ReorderAgentsInput = z.infer<typeof ReorderAgentsSchema>
export type ForkAgentInput = z.infer<typeof ForkAgentSchema>
export type StartAgentInput = z.infer<typeof StartAgentSchema>
export type StopAgentInput = z.infer<typeof StopAgentSchema>
export type AgentQueryInput = z.infer<typeof AgentQuerySchema>
export type MessageQueryInput = z.infer<typeof MessageQuerySchema>
export type UsageQueryInput = z.infer<typeof UsageQuerySchema>
