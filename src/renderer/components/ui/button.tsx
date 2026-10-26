import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cn } from '@/lib/utils'

const variants = {
  primary:
    'bg-primary text-on-primary rounded-full hover:brightness-110 active:scale-95 transition-all',
  secondary:
    'bg-primary-fixed dark:bg-primary-container text-on-primary-fixed-variant dark:text-on-primary-container rounded-full hover:bg-primary-fixed/80 dark:hover:bg-primary-container/80 active:scale-95 transition-all',
  outline:
    'border-2 border-primary text-primary rounded-full hover:bg-primary/5 active:scale-95 transition-all',
  ghost: 'text-on-surface-variant hover:text-primary active:scale-95 transition-all',
  danger: 'bg-error text-on-error rounded-full hover:brightness-110 active:scale-95 transition-all',
  cta: 'bg-secondary-container text-on-secondary-container rounded-xl shadow-sm hover:translate-y-[-2px] transition-all',
} as const

const sizes = {
  sm: 'px-3 py-1.5 text-label-sm',
  md: 'px-md py-sm text-label-md',
  lg: 'px-6 py-3 text-label-md',
  icon: 'w-10 h-10 flex items-center justify-center rounded-full',
} as const

type Variant = keyof typeof variants
type Size = keyof typeof sizes

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  asChild?: boolean
  children?: ReactNode
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', asChild = false, className, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(
          'font-label-md inline-flex items-center justify-center gap-xs outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    )
  },
)
Button.displayName = 'Button'

export { Button, type ButtonProps }
