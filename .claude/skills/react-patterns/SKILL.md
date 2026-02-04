---
name: react-patterns
description: React patterns and best practices for Claude Manager frontend. Use when building components, managing state, implementing hooks, or integrating with the API. Triggers on "create component", "add hook", "React pattern", "state management", or when working on frontend features.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# React Patterns for Claude Manager

Frontend patterns following the existing codebase conventions.

## Component Structure

### Basic Component

```tsx
// src/components/ComponentName.tsx
import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface ComponentNameProps {
  requiredProp: string
  optionalProp?: number
  onAction?: (value: string) => void
}

export function ComponentName({
  requiredProp,
  optionalProp = 10,
  onAction,
}: ComponentNameProps) {
  const [state, setState] = useState<string>('')

  const handleAction = useCallback(() => {
    onAction?.(state)
  }, [state, onAction])

  return (
    <div className={cn('base-styles', optionalProp > 5 && 'conditional-style')}>
      {/* Component content */}
    </div>
  )
}
```

### Component with Data Fetching

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

export function DataComponent({ id }: { id: string }) {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.resource.detail(id),
    queryFn: () => api.resources.get(id),
  })

  const mutation = useMutation({
    mutationFn: (updates: UpdateDto) => api.resources.update(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.resource.detail(id) })
    },
  })

  if (isLoading) return <Skeleton />
  if (isError) return <ErrorState />

  return <div>{data?.name}</div>
}
```

## Custom Hooks

### Data Fetching Hook

```tsx
// src/hooks/useResource.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { queryKeys } from '@/lib/queryKeys'

export function useResource(id: string) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: queryKeys.resource.detail(id),
    queryFn: () => api.resources.get(id),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (updates: UpdateDto) => api.resources.update(id, updates),
    onMutate: async (updates) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.resource.detail(id) })
      const previous = queryClient.getQueryData(queryKeys.resource.detail(id))
      queryClient.setQueryData(queryKeys.resource.detail(id), (old) => ({
        ...old,
        ...updates,
      }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      queryClient.setQueryData(queryKeys.resource.detail(id), context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.resource.detail(id) })
    },
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
  }
}
```

### WebSocket Subscription Hook

```tsx
// src/hooks/useSubscription.ts
import { useEffect, useRef } from 'react'
import { wsClient } from '@/lib/websocket'

export function useAgentSubscription(agentId: string | null) {
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!agentId) return

    wsClient.subscribeToAgent(agentId)
    unsubscribeRef.current = () => wsClient.unsubscribeFromAgent(agentId)

    return () => {
      unsubscribeRef.current?.()
    }
  }, [agentId])
}
```

## State Patterns

### Form State

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const formSchema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
})

type FormValues = z.infer<typeof formSchema>

export function FormComponent() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', email: '' },
  })

  const onSubmit = (values: FormValues) => {
    // Handle submission
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Input {...form.register('name')} />
      {form.formState.errors.name && (
        <span>{form.formState.errors.name.message}</span>
      )}
    </form>
  )
}
```

### Dialog State

```tsx
import { useState } from 'react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'

export function DialogComponent() {
  const [open, setOpen] = useState(false)

  const handleSuccess = () => {
    setOpen(false)
    // Additional logic
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Open</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogForm onSuccess={handleSuccess} />
      </DialogContent>
    </Dialog>
  )
}
```

## Existing Component Patterns

### AgentBox Pattern
- Status indicator with color coding
- Dropdown menus for mode/permissions
- Action buttons with hover states
- Drag handle for reordering

### WorktreeRow Pattern
- Horizontal scrolling container
- Drag-and-drop for agents
- Sort mode controls
- Collapsible sections

### AgentModal Pattern
- Tabbed interface for multiple agents
- Chat-style message list
- Input with keyboard shortcuts
- Real-time status updates

## Styling Conventions

```tsx
// Use cn() for conditional classes
<div className={cn(
  'base-class',
  isActive && 'active-class',
  variant === 'primary' && 'primary-variant'
)} />

// Use Tailwind utilities
<div className="flex items-center gap-2 p-4 rounded-lg bg-background" />

// Custom CSS classes from index.css
<div className="agent-box agent-box-running" />
```

## Error Boundaries

```tsx
import { ErrorBoundary } from 'react-error-boundary'

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="p-4 text-red-500">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <Button onClick={resetErrorBoundary}>Try again</Button>
    </div>
  )
}

// Usage
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <ComponentThatMightError />
</ErrorBoundary>
```
