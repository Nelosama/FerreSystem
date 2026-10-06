import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'dark';
}

/** Theme is inherited from the document; native button props remain available. */
export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={`btn btn-${variant} ${className}`.trim()} />;
}
